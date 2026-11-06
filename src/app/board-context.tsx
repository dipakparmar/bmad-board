import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useBoard } from './use-board';
import { ticketsOf, type Ticket } from './view-model';

/** What the sidebar narrows the board to. */
export interface Scope {
  workspaceId?: string;
  initiative?: string;
  /** An epic slug, or `backlog`. */
  epic?: string;
}

export type View = 'board' | 'list' | 'next' | 'standup';

function useBoardState() {
  const board = useBoard();
  const [scope, setScope] = useState<Scope>({});
  const [view, setView] = useState<View>('next');
  const [search, setSearch] = useState('');
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'github' | 'new-ticket' | 'search' | null>(null);

  const tickets = useMemo(
    () => board.workspaces.flatMap((w) => (w.tree ? ticketsOf(w.store.id, w.store.label, w.tree, w.store.capabilities.write) : [])),
    [board.workspaces],
  );
  const inScope = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets.filter((t) =>
      t.leaf.state !== 'dropped' &&
      (!scope.workspaceId || t.workspaceId === scope.workspaceId) &&
      (!scope.initiative || t.initiative?.slug === scope.initiative) &&
      (!scope.epic || (scope.epic === 'backlog' ? t.leaf.folder === 'backlog' : t.epic?.slug === scope.epic)) &&
      (!q || `${t.ref} ${t.leaf.title} ${t.leaf.plan?.assignee ?? ''} ${t.epic?.title ?? ''} ${t.leaf.type}`.toLowerCase().includes(q)),
    );
  }, [tickets, scope, search]);
  const selected: Ticket | null = tickets.find((t) => t.uid === selectedUid) ?? null;

  return { board, scope, setScope, view, setView, search, setSearch, tickets, inScope, selected, select: setSelectedUid, dialog, setDialog };
}

export type BoardState = ReturnType<typeof useBoardState>;

const Ctx = createContext<BoardState | null>(null);

export function BoardProvider({ children }: { children: ReactNode }) {
  const state = useBoardState();
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export function useBoardContext(): BoardState {
  const value = useContext(Ctx);
  if (!value) throw new Error('useBoardContext needs a BoardProvider');
  return value;
}
