import { isGitHubAutomation, mergeMembers, type Member } from './people';

/** Explicit, project-scoped identity corrections. No fuzzy or first-name matching. */
export interface Identity {
  id: string;
  name: string;
  aliases: string[];
  agent: boolean;
  hidden: boolean;
}
export type IdentitySettings = Record<string, Identity[]>;
export const identityKey = (value: string) => value.trim().replace(/^@/, '').toLowerCase();
export const identityAliases = (m: Member) => [...new Set([m.name, m.email, m.login, ...(m.aliases ?? [])].filter((v): v is string => !!v))];
export function findIdentity(value: string, identities: Identity[]): Identity | undefined {
  const key = identityKey(value);
  const identity = identities.find((i) => [i.name, ...i.aliases].some((a) => identityKey(a) === key));
  // Repair earlier accepted suggestions for the reserved GitHub web signer as well.
  return identity && isGitHubAutomation(identity.aliases) ? { ...identity, agent: true } : identity;
}
export function identityError(identity: Identity, others: Identity[]): string | undefined {
  if (!identity.name.trim()) return 'Enter a display name.';
  const keys = new Set([identity.name, ...identity.aliases].map(identityKey));
  const conflict = others.find((i) => i.id !== identity.id && [i.name, ...i.aliases].some((a) => keys.has(identityKey(a))));
  return conflict ? `An alias already belongs to ${conflict.name}. Edit that user to group these identities.` : undefined;
}
export function resolveMembers(members: Member[], identities: Identity[]): Member[] {
  const mapped = members.map((m) => {
    const identity = identityAliases(m).map((a) => findIdentity(a, identities)).find(Boolean);
    return identity ? { ...m, name: identity.name, agent: identity.agent, aliases: [...identityAliases(m), ...identity.aliases] } : m;
  });
  return mergeMembers(mapped, identities.map((i) => ({ name: i.name, agent: i.agent, aliases: i.aliases, commits: 0, sources: [] }))).map((m) => {
    const identity = findIdentity(m.name, identities);
    if (isGitHubAutomation(identityAliases(m))) return { ...m, agent: true };
    return identity ? { ...m, agent: identity.agent } : m;
  });
}

export interface ResolvedPerson extends Member {
  id: string;
  hidden?: boolean;
}

/** The same canonical roster entry for saved aliases and identities already joined by Git evidence. */
export function createPersonResolver(members: Member[], identities: Identity[]) {
  const index = new Map<string, Member>();
  for (const member of members) for (const alias of identityAliases(member)) index.set(identityKey(alias), member);
  return (value: string): ResolvedPerson | undefined => {
    const identity = findIdentity(value, identities);
    const member = index.get(identityKey(value)) ?? (identity ? index.get(identityKey(identity.name)) : undefined);
    const rule = identity ?? (member ? findIdentity(member.name, identities) : undefined);
    if (!member && !rule) return undefined;
    const name = rule?.name ?? member!.name;
    return {
      ...member, id: rule?.id ?? `person:${identityKey(name)}`, name,
      aliases: [...new Set([...(member ? identityAliases(member) : []), ...(rule?.aliases ?? [])])],
      agent: isGitHubAutomation(member ? identityAliases(member) : rule?.aliases ?? []) || (rule?.agent ?? member?.agent ?? false),
      hidden: rule?.hidden, commits: member?.commits ?? 0, sources: member?.sources ?? [],
    };
  };
}
