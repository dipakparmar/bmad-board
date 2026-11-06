/**
 * The team roster: people and agents who can hold a ticket. It is gathered from git authors (and the
 * board's `Changed-by:` trailers), from GitHub contributors, and from names already written as assignees.
 * Assignee stays free text in BMAD's plan files, so the roster only suggests; it never restricts.
 */

export interface Member {
  /** What goes in a plan's `assignee:`. */
  name: string;
  email?: string;
  /** GitHub login, when known. */
  login?: string;
  avatarUrl?: string;
  agent: boolean;
  /** Commits seen in the scanned window. */
  commits: number;
  /** ISO date of their latest commit in the window. */
  lastActive?: string;
  /** Where we learned of them. */
  sources: ('git' | 'github' | 'tickets')[];
}

const AGENT = /agent|claude|bot|\[bot\]/i;

/** `person:Dipak via bmad-board` → { name: 'Dipak', agent: false }. */
export function parseChangedBy(value: string): { name: string; agent: boolean } | null {
  const m = /^\s*(person|agent):(.+?)(?:\s+via\s+.*)?\s*$/.exec(value);
  return m ? { name: (m[2] ?? '').trim(), agent: m[1] === 'agent' } : null;
}

function keysOf(m: Pick<Member, 'name' | 'email' | 'login'>): string[] {
  return [m.name && `n:${m.name.trim().toLowerCase()}`, m.email && `e:${m.email.toLowerCase()}`, m.login && `l:${m.login.toLowerCase()}`, m.login && `n:${m.login.toLowerCase()}`].filter((k): k is string => !!k);
}

/**
 * Merges rosters from several sources. Two entries are one member when they share a name, an email
 * or a login (a GitHub login also matches a git author with that name). Busiest and most recent first.
 */
export function mergeMembers(...lists: Member[][]): Member[] {
  const out: Member[] = [];
  const index = new Map<string, Member>();
  for (const m of lists.flat()) {
    if (!m.name.trim()) continue;
    const hit = keysOf(m).map((k) => index.get(k)).find(Boolean);
    if (hit) {
      hit.email ??= m.email;
      hit.login ??= m.login;
      hit.avatarUrl ??= m.avatarUrl;
      hit.agent ||= m.agent;
      hit.commits = Math.max(hit.commits, m.commits);
      if (m.lastActive && (!hit.lastActive || m.lastActive > hit.lastActive)) hit.lastActive = m.lastActive;
      for (const s of m.sources) if (!hit.sources.includes(s)) hit.sources.push(s);
      for (const k of keysOf(hit)) index.set(k, hit);
    } else {
      const copy = { ...m, sources: [...m.sources] };
      out.push(copy);
      for (const k of keysOf(copy)) index.set(k, copy);
    }
  }
  return out.sort((a, b) => Number(a.agent) - Number(b.agent) || (b.lastActive ?? '').localeCompare(a.lastActive ?? '') || b.commits - a.commits || a.name.localeCompare(b.name));
}

/** Members named as assignees in the tickets. */
export function membersFromAssignees(assignees: (string | undefined)[]): Member[] {
  const names = [...new Set(assignees.map((a) => a?.trim()).filter((a): a is string => !!a))];
  return names.map((name) => ({ name, agent: AGENT.test(name), commits: 0, sources: ['tickets'] }));
}

/** One git log line per commit: author name, email, date and the Changed-by trailer (may be empty). */
export function membersFromGitLog(lines: { name: string; email: string; date: string; changedBy?: string }[]): Member[] {
  const by = new Map<string, Member>();
  const add = (name: string, agent: boolean, date: string, email?: string) => {
    const key = name.toLowerCase();
    const m = by.get(key) ?? { name, email, agent, commits: 0, sources: ['git'] as Member['sources'] };
    m.commits += 1;
    m.agent ||= agent;
    if (!m.lastActive || date > m.lastActive) m.lastActive = date;
    by.set(key, m);
  };
  for (const l of lines) {
    const via = l.changedBy ? parseChangedBy(l.changedBy) : null;
    // A board commit names who made the change; credit them, not the machine that committed it.
    if (via) add(via.name, via.agent, l.date);
    else add(l.name, AGENT.test(l.name) || AGENT.test(l.email), l.date, l.email);
  }
  return [...by.values()];
}
