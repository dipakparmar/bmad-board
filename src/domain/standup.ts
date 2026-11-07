/**
 * Stand-up: the team's tickets grouped by who holds them, people and agents alike. Each member says
 * what they finished since the last stand-up, what they're on, what waits on review, and what blocks them.
 * "Finished" comes from git: commits by that member since the cut-off, and the tickets those commits touched.
 */
import { isAgent, isHidden, type BoardConfig } from './board-config';
import type { ResolvedPerson } from './identities';
import type { Leaf } from './ticket-tree';

/** A commit as the stand-up sees it. The store's Activity fits this shape. */
export interface StandupCommit {
  sha: string;
  date: string;
  subject: string;
  /** Who made it: the `Changed-by:` name, or the git author. */
  actor: string;
  agent: boolean;
  /** Files it touched, relative to the project root. Empty when the source can't tell. */
  paths: string[];
  url?: string;
}

export interface StandupMember<T> {
  /** Canonical person id when a roster resolver is available; otherwise a lower-cased name. */
  id: string;
  name: string;
  agent: boolean;
  /** Tickets now built, in review or done that this member's commits touched since the cut-off. */
  finished: T[];
  /** Their commits since the cut-off, newest first. */
  commits: StandupCommit[];
  doing: T[];
  /** Built or in review before the cut-off: still waiting for a person to check. */
  review: T[];
  blocked: T[];
  /** Assigned, not started. */
  upNext: T[];
}

export interface Standup<T> {
  since: Date;
  members: StandupMember<T>[];
  /** Ready to start and nobody holds them. */
  upForGrabs: T[];
  /** Unassigned tickets that need a person: built work to check, and blocks. */
  unowned: T[];
}

const AGENT = /agent|claude|codex|copilot|bot|\[bot\]/i;

export function isAgentName(name: string): boolean {
  return AGENT.test(name);
}

function memberId(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Start of the last working day before `now`: yesterday at midnight, or Friday's on a Monday
 * (and on a weekend). Stand-ups cover "since last time", and nobody holds one on Sunday.
 */
export function lastWorkingDay(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const back = { 0: 2, 1: 3, 6: 1 }[d.getDay()] ?? 1;
  d.setDate(d.getDate() - back);
  return d;
}

export function standup<T extends { leaf: Leaf; readiness?: string }>(tickets: T[], commits: StandupCommit[], since: Date, config?: BoardConfig, resolve?: (name: string) => ResolvedPerson | undefined): Standup<T> {
  const members = new Map<string, StandupMember<T>>();
  const member = (name: string, agent = isAgent(name, config)) => {
    const person = resolve?.(name);
    const id = person?.id ?? memberId(name);
    let m = members.get(id);
    if (!m) {
      m = { id, name: person?.name ?? name.trim(), agent: person?.agent ?? agent, finished: [], commits: [], doing: [], review: [], blocked: [], upNext: [] };
      members.set(id, m);
    }
    return m;
  };

  const byPath = new Map<string, T>();
  for (const t of tickets) {
    if (t.leaf.file) byPath.set(t.leaf.file.path, t);
    if (t.leaf.plan) byPath.set(t.leaf.plan.path, t);
  }

  const upForGrabs: T[] = [];
  const unowned: T[] = [];
  for (const t of tickets) {
    const { leaf } = t;
    if (leaf.state === 'dropped' || leaf.state === 'done') continue;
    const blocked = leaf.status === 'blocked' || !!leaf.plan?.blockedAt;
    const review = leaf.status === 'built' || leaf.status === 'in-review';
    const who = leaf.plan?.assignee?.trim();
    if (!who) {
      if (blocked && leaf.plan?.blockedAt) unowned.push(t);
      else if (review) unowned.push(t);
      else if (t.readiness === 'ready') upForGrabs.push(t);
      continue;
    }
    const m = member(who);
    if (blocked) m.blocked.push(t);
    else if (review) m.review.push(t);
    else if (leaf.status === 'in-progress') m.doing.push(t);
    else m.upNext.push(t);
  }

  const cutoff = since.getTime();
  for (const c of [...commits].sort((a, b) => b.date.localeCompare(a.date))) {
    if (new Date(c.date).getTime() < cutoff) continue;
    const m = member(c.actor, c.agent);
    if (!m.commits.some((existing) => existing.sha === c.sha)) m.commits.push({ ...c, actor: m.name, agent: m.agent });
    for (const p of c.paths) {
      const t = byPath.get(p);
      if (!t || m.finished.includes(t)) continue;
      const s = t.leaf.status;
      if (s === 'done' || s === 'built' || s === 'in-review') m.finished.push(t);
    }
  }

  // Built since the cut-off already shows as finished; don't list it again as waiting on review.
  for (const m of members.values()) m.review = m.review.filter((t) => !m.finished.includes(t));

  // Hidden people (CI users, ex-teammates) drop out unless they still hold tickets.
  const shown = [...members.values()].filter((m) => !(resolve?.(m.name)?.hidden ?? isHidden(m.name, config)) || m.doing.length + m.review.length + m.blocked.length + m.upNext.length > 0);
  const ordered = shown.sort((a, b) => Number(a.agent) - Number(b.agent) || a.name.localeCompare(b.name));
  return { since, members: ordered, upForGrabs, unowned };
}

/** What the person running the stand-up wrote: one note per member (by member id) and one for the team. */
export interface StandupNotes {
  members: Record<string, string>;
  team: string;
}

/** Where a day's stand-up notes live, so they are versioned with the tickets and agents can read them. */
export function standupNotesPath(outputFolder: string, day: Date): string {
  const d = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  return `${outputFolder.replace(/\/+$/, '')}/standups/standup-${d}.md`;
}

/** Reads the notes back out of a saved stand-up file (the `- **Notes:**` lines and the team section). */
export function parseStandupNotes(text: string, members: { id: string; name: string }[]): StandupNotes {
  const out: StandupNotes = { members: {}, team: '' };
  const sections = text.split(/^### /m).slice(1);
  for (const sec of sections) {
    const [head = '', ...rest] = sec.split('\n');
    const name = head.replace(/\s*\(agent\)\s*$/, '').trim();
    const m = members.find((x) => x.name === name) ?? { id: name.toLowerCase() };
    const note = /^- \*\*Notes:\*\* ([\s\S]*?)(?=^- \*\*|^## |(?![\s\S]))/m.exec(rest.join('\n'))?.[1]?.trim();
    if (note) out.members[m.id] = note.replace(/\n  /g, '\n');
  }
  const team = /^## Team notes\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text)?.[1]?.trim();
  if (team) out.team = team;
  return out;
}

/** Stand-up notes as markdown, to paste in a team channel or save beside the tickets. */
export function standupNotes<T extends { leaf: Leaf }>(s: Standup<T>, refOf: (t: T) => string, notes?: StandupNotes, title = 'Stand-up'): string {
  const line = (t: T) => `${refOf(t)} ${t.leaf.title}`;
  const out = [`## ${title} · since ${s.since.toDateString()}`];
  for (const m of s.members) {
    out.push('', `### ${m.name}${m.agent ? ' (agent)' : ''}`);
    const done = m.finished.length ? m.finished.map(line) : m.commits.slice(0, 5).map((c) => c.subject);
    out.push(`- **Done:** ${done.length ? done.join('; ') : 'nothing new'}`);
    const doing = [...m.doing.map(line), ...m.review.map((t) => `${line(t)} (in review)`)];
    out.push(`- **Doing:** ${doing.length ? doing.join('; ') : 'nothing'}`);
    if (m.blocked.length) out.push(`- **Blocked:** ${m.blocked.map((t) => `${line(t)}${t.leaf.plan?.blockedReason ? `: ${t.leaf.plan.blockedReason}` : ''}`).join('; ')}`);
    const note = notes?.members[m.id]?.trim();
    if (note) out.push(`- **Notes:** ${note.replace(/\n/g, '\n  ')}`);
  }
  if (s.unowned.length) out.push('', `**Needs an owner:** ${s.unowned.map(line).join('; ')}`);
  if (s.upForGrabs.length) out.push('', `**Up for grabs:** ${s.upForGrabs.map(line).join('; ')}`);
  if (notes?.team.trim()) out.push('', '## Team notes', notes.team.trim());
  return out.join('\n');
}
