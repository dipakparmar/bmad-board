/** The roster for one workspace: git or GitHub people merged with names already used as assignees. */
import { useEffect, useMemo, useState } from 'react';
import { isAgent, isHidden, membersFromAssignees, mergeMembers, type Member } from '@/domain';
import { useBoardContext } from './board-context';

// One fetch per workspace per page load; the sources cache across loads themselves.
const fetched = new Map<string, Promise<Member[]>>();

export function usePeople(workspaceId: string | undefined): Member[] {
  const { board, tickets } = useBoardContext();
  const ws = board.workspaces.find((w) => w.store.id === workspaceId);
  const [remote, setRemote] = useState<Member[]>([]);
  useEffect(() => {
    if (!ws) return;
    let p = fetched.get(ws.store.id);
    if (!p) {
      p = ws.store.people().catch(() => []);
      fetched.set(ws.store.id, p);
    }
    let live = true;
    void p.then((m) => live && setRemote(m));
    return () => {
      live = false;
    };
  }, [ws]);
  const config = ws?.tree?.board;
  return useMemo(
    () =>
      mergeMembers(remote, membersFromAssignees(tickets.filter((t) => t.workspaceId === workspaceId).map((t) => t.leaf.plan?.assignee)))
        .filter((m) => !isHidden(m.name, config) && !(m.login && isHidden(m.login, config)))
        .map((m) => (config && isAgent(m.name, config) ? { ...m, agent: true } : m)),
    [remote, tickets, workspaceId, config],
  );
}
