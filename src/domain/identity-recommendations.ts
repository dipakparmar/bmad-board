import { findIdentity, identityAliases, identityKey, type Identity } from './identities';
import { githubLoginFromEmail, isGitHubAutomation, type Member } from './people';

export interface IdentityRecommendation {
  id: string;
  name: string;
  aliases: string[];
  reasons: string[];
  existingIds: string[];
  agent: boolean;
  hidden: boolean;
}
interface Group {
  members: Member[];
  aliases: string[];
  rules: Identity[];
  reasons: Set<string>;
}
const compact = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const fullNames = (group: Group) => group.aliases.filter((a) => !a.includes('@') && /^[\p{L}]+(?:[ .'-]+[\p{L}]+)+$/u.test(a));
const names = (group: Group) => group.aliases.filter((a) => !a.includes('@')).map(identityKey);
const logins = (group: Group) => group.members.flatMap((m) => [m.login, ...identityAliases(m).map(githubLoginFromEmail)]).filter((v): v is string => !!v).map(identityKey);
const label = (group: Group) => group.rules[0]?.name ?? group.members.find((m) => m.sources.includes('tickets'))?.name ?? fullNames(group)[0] ?? group.members[0]?.name ?? '';

/** Recommendations only. A browser mapping is written after the user accepts the proposed groups. */
export function recommendIdentities(members: Member[], rules: Identity[]) {
  let groups: Group[] = members.filter((m) => !isGitHubAutomation(identityAliases(m)) && (!m.agent || identityAliases(m).some((a) => findIdentity(a, rules)?.agent === false))).map((m) => ({ members: [m], aliases: identityAliases(m), rules: [], reasons: new Set<string>() }));
  for (const rule of rules.filter((r) => !r.agent && !isGitHubAutomation(r.aliases))) groups.push({ members: [], aliases: [rule.name, ...rule.aliases], rules: [rule], reasons: new Set() });
  const join = (a: Group, b: Group, reason: string) => {
    a.members.push(...b.members);
    a.aliases = [...new Set([...a.aliases, ...b.aliases])];
    a.rules = [...new Map([...a.rules, ...b.rules].map((r) => [r.id, r])).values()];
    a.reasons = new Set([...a.reasons, ...b.reasons, reason]);
    groups = groups.filter((g) => g !== b);
  };
  // First link exact observations, GitHub private addresses, and full-name/login spellings.
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
      const a = groups[i]!; const b = groups[j]!;
      if (a.rules.length && b.rules.length && a.rules[0]?.id !== b.rules[0]?.id) continue;
      const shared = a.aliases.some((x) => b.aliases.some((y) => identityKey(x) === identityKey(y)));
      const account = logins(a).some((l) => [...names(b), ...logins(b)].includes(l)) || logins(b).some((l) => names(a).includes(l));
      const full = fullNames(a).some((n) => [...names(b), ...logins(b)].some((x) => compact(n) === compact(x))) || fullNames(b).some((n) => [...names(a), ...logins(a)].some((x) => compact(n) === compact(x)));
      if (shared || account || full) {
        join(a, b, shared ? 'Shared name, email or saved alias' : account ? 'GitHub login matches its private commit email' : 'Full name matches the account spelling');
        changed = true; break outer;
      }
    }
  }
  const ambiguous: { name: string; candidates: string[] }[] = [];
  // Short BMAD owners are proposed only when exactly one distinct person has that first name.
  for (const group of [...groups]) {
    if (!groups.includes(group) || group.rules.length || group.members.length !== 1) continue;
    const member = group.members[0]!;
    if (!member.sources.includes('tickets') || !/^[\p{L}]+$/u.test(member.name)) continue;
    const first = compact(member.name);
    const candidates = groups.filter((g) => g !== group && (fullNames(g).some((n) => { const actual = compact(n.split(/[ .'-]/)[0] ?? ''); return actual === first || (first.length >= 4 && actual.startsWith(first)); }) || logins(g).some((login) => first.length >= 4 && compact(login).startsWith(first))));
    if (candidates.length === 1) join(candidates[0]!, group, 'BMAD first name or short name matches one discovered person');
    else if (candidates.length > 1) ambiguous.push({ name: member.name, candidates: candidates.map(label) });
  }
  const matches: IdentityRecommendation[] = [];
  for (const group of groups) {
    const aliases = [...new Set(group.aliases.map((a) => a.trim()).filter(Boolean))];
    if (aliases.length < 2) continue;
    const rule = group.rules[0];
    if (rule && aliases.every((a) => [rule.name, ...rule.aliases].some((b) => identityKey(a) === identityKey(b)))) continue;
    // Respect existing agent mappings even when the original heuristic saw a person.
    if (aliases.some((a) => findIdentity(a, rules)?.agent === true)) continue;
    if (!group.reasons.size) group.reasons.add('Names and commit emails observed for the same identity');
    const name = label(group);
    matches.push({ id: aliases.map(identityKey).sort().join('|'), name, aliases, reasons: [...group.reasons], existingIds: group.rules.map((r) => r.id), agent: rule?.agent ?? false, hidden: rule?.hidden ?? false });
  }
  return { matches: matches.sort((a, b) => a.name.localeCompare(b.name)), ambiguous };
}

/** Apply a reviewed batch atomically, preserving existing profile ids and manual settings. */
export function acceptIdentityRecommendations(rules: Identity[], selected: IdentityRecommendation[]): Identity[] {
  let next = [...rules];
  for (const match of selected) {
    const existing = next.filter((r) => match.existingIds.includes(r.id));
    const identity: Identity = { id: existing[0]?.id ?? crypto.randomUUID(), name: match.name, aliases: [...new Set([...match.aliases, ...existing.flatMap((r) => [r.name, ...r.aliases])])], agent: existing[0]?.agent ?? match.agent, hidden: existing[0]?.hidden ?? match.hidden };
    const conflicts = next.filter((r) => !match.existingIds.includes(r.id)).some((r) => [r.name, ...r.aliases].some((a) => [identity.name, ...identity.aliases].some((b) => identityKey(a) === identityKey(b))));
    if (conflicts) throw new Error(`A mapping for ${match.name} conflicts with another saved user. Review that user first.`);
    next = [...next.filter((r) => !match.existingIds.includes(r.id)), identity];
  }
  return next;
}
