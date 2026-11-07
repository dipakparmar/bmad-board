/**
 * The team roster: people and agents who can hold a ticket. It is gathered from git authors (and the
 * board's `Changed-by:` trailers), from GitHub contributors, and from names already written as assignees.
 * Assignee stays free text in BMAD's plan files, so the roster only suggests; it never restricts.
 */

export interface Member {
  /** What goes in a plan's `assignee:`. */
  name: string;
  email?: string;
  /** All observed spellings, retained across merges. */
  aliases?: string[];
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

const AGENT = /agent|claude|codex|copilot|bot|\[bot\]/i;

/** GitHub's web commit signer is infrastructure, unlike a person's private GitHub address. */
export function isGitHubAutomation(values: (string | undefined)[]): boolean {
  return values.some((value) => value?.trim().toLowerCase() === 'noreply@github.com');
}

export function isAutomatedIdentity(name: string, email?: string): boolean {
  return AGENT.test(name) || !!(email && AGENT.test(email)) || isGitHubAutomation([email]);
}

/** `person:Dipak via bmad-board` → { name: 'Dipak', agent: false }. */
export function parseChangedBy(value: string): { name: string; agent: boolean } | null {
  const m = /^\s*(person|agent):(.+?)(?:\s+via\s+.*)?\s*$/.exec(value);
  return m ? { name: (m[2] ?? '').trim(), agent: m[1] === 'agent' } : null;
}

/** GitHub's public private-email format identifies the account without guessing email prefixes. */
export function githubLoginFromEmail(email: string): string | undefined {
  return /^(?:\d+\+)?([^@]+)@users\.noreply\.github\.com$/i.exec(email.trim())?.[1]?.toLowerCase();
}

function keysOf(m: Pick<Member, 'name' | 'email' | 'login' | 'aliases'>): string[] {
  const keys = [m.name && `n:${m.name.trim().toLowerCase()}`, m.login && `n:${m.login.trim().toLowerCase()}`];
  for (const alias of [m.email, ...(m.aliases ?? [])]) {
    if (!alias) continue;
    const value = alias.trim().toLowerCase();
    keys.push(`${value.includes('@') ? 'e' : 'n'}:${value}`);
    const login = githubLoginFromEmail(value);
    if (login) keys.push(`n:${login}`);
  }
  return keys.filter((k): k is string => !!k);
}

/**
 * Merges rosters from several sources. Two entries are one member when they share a name, an email
 * or a login (a GitHub login also matches a git author with that name). Busiest and most recent first.
 */
export function mergeMembers(...lists: Member[][]): Member[] {
  const groups: { member: Member; keys: Set<string> }[] = [];
  for (const m of lists.flat()) {
    if (!m.name.trim()) continue;
    const keys = new Set(keysOf(m));
    const hits = groups.filter((g) => [...keys].some((k) => g.keys.has(k)));
    const member: Member = { ...m, sources: [...m.sources], aliases: [...(m.aliases ?? [])] };
    // Combine every connected group, including a record that bridges two earlier identities.
    for (const hit of hits) {
      for (const k of hit.keys) keys.add(k);
      const old = hit.member;
      member.name = old.name;
      member.email ??= old.email;
      member.login ??= old.login;
      member.avatarUrl ??= old.avatarUrl;
      member.agent ||= old.agent;
      member.commits = Math.max(member.commits, old.commits);
      if (old.lastActive && (!member.lastActive || old.lastActive > member.lastActive)) member.lastActive = old.lastActive;
      member.sources = [...new Set([...old.sources, ...member.sources])];
      member.aliases = [...new Set([...(member.aliases ?? []), ...(old.aliases ?? []), old.name, m.name, ...[old.email, old.login, m.email, m.login].filter((v): v is string => !!v)])];
      groups.splice(groups.indexOf(hit), 1);
    }
    groups.push({ member, keys });
  }
  return groups.map((g) => g.member).sort((a, b) => Number(a.agent) - Number(b.agent) || (b.lastActive ?? '').localeCompare(a.lastActive ?? '') || b.commits - a.commits || a.name.localeCompare(b.name));
}

/** Members named as assignees in the tickets. */
export function membersFromAssignees(assignees: (string | undefined)[]): Member[] {
  const names = [...new Set(assignees.map((a) => a?.trim()).filter((a): a is string => !!a))];
  return names.map((name) => ({ name, agent: AGENT.test(name), commits: 0, sources: ['tickets'] }));
}

/** One git log line per commit: author name, email, date and the Changed-by trailer (may be empty). */
export function membersFromGitLog(lines: { name: string; email: string; date: string; changedBy?: string; coAuthors?: string; committerName?: string; committerEmail?: string }[]): Member[] {
  const by = new Map<string, Member>();
  let credited = new Set<string>();
  const add = (name: string, agent: boolean, date: string, email?: string) => {
    const key = name.toLowerCase();
    const m = by.get(key) ?? { name, email, agent, commits: 0, sources: ['git'] as Member['sources'] };
    m.aliases = [...new Set([...(m.aliases ?? []), name, ...(email ? [email] : [])])];
    m.email ??= email;
    const login = email ? githubLoginFromEmail(email) : undefined;
    if (login) {
      m.login ??= login;
      m.avatarUrl ??= `https://avatars.githubusercontent.com/${encodeURIComponent(login)}?s=64`;
    }
    if (!credited.has(key)) m.commits += 1;
    credited.add(key);
    m.agent ||= agent;
    if (!m.lastActive || date > m.lastActive) m.lastActive = date;
    by.set(key, m);
  };
  for (const l of lines) {
    credited = new Set();
    const via = l.changedBy ? parseChangedBy(l.changedBy) : null;
    // A board commit names who made the change; credit them, not the machine that committed it.
    if (via) add(via.name, via.agent, l.date);
    else add(l.name, isAutomatedIdentity(l.name, l.email), l.date, l.email);
    const seen = new Set([`${l.name.toLowerCase()}<${l.email.toLowerCase()}>`]);
    if (l.committerName && l.committerEmail && (l.committerName.toLowerCase() !== l.name.toLowerCase() || l.committerEmail.toLowerCase() !== l.email.toLowerCase())) {
      seen.add(`${l.committerName.toLowerCase()}<${l.committerEmail.toLowerCase()}>`);
      add(l.committerName, isAutomatedIdentity(l.committerName, l.committerEmail), l.date, l.committerEmail);
    }
    for (const line of (l.coAuthors ?? '').split('\n')) {
      const match = /^\s*(.+?)\s*<([^>]+)>\s*$/.exec(line);
      if (!match) continue;
      const [, name = '', email = ''] = match;
      const key = `${name.toLowerCase()}<${email.toLowerCase()}>`;
      if (seen.has(key)) continue;
      seen.add(key);
      add(name, isAutomatedIdentity(name, email), l.date, email);
    }
  }
  return [...by.values()];
}
