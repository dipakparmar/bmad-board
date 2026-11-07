/** One shared roster, with the same corrections as ticket ownership. */
import { isAgent, isHidden } from '@/domain';
import { findIdentity } from '@/domain/identities';
import { useBoardContext } from './board-context';

export function usePeople(workspaceId: string | undefined) {
  const { people, identities, board } = useBoardContext();
  const config = board.workspaces.find((w) => w.store.id === workspaceId)?.tree?.board;
  const rules = identities.settings[workspaceId ?? ''] ?? [];
  return (people[workspaceId ?? ''] ?? []).filter((m) => {
    const rule = findIdentity(m.name, rules);
    return rule ? !rule.hidden : !isHidden(m.name, config) && !(m.login && isHidden(m.login, config));
  }).map((m) => findIdentity(m.name, rules) ? m : { ...m, agent: m.agent || isAgent(m.name, config) });
}
