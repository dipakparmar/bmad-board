import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { loadPreferences, usePreferences } from './preferences';
import { loadAuthor, useBoard } from './use-board';
import { ticketsOf, type Ticket } from './view-model';

/** What the sidebar narrows the board to. */
export interface Scope {
  workspaceId?: string;
  initiative?: string;
  /** An epic slug, or `backlog`. */
  epic?: string;
}

export type View = 'board' | 'list' | 'next' | 'standup' | 'graph' | 'settings';

function readHash(): { ref?: string; ws?: string; full: boolean } {
  const p = new URLSearchParams(location.hash.slice(1));
  return { ref: p.get('ticket') ?? undefined, ws: p.get('ws') ?? undefined, full: p.get('full') === '1' };
}

function useBoardState() {
  const board = useBoard();
  const preferences = usePreferences();
  const [mineOnly, setMineOnly] = useState(false);
  const [scope, setScope] = useState<Scope>({});
  const [view, setView] = useState<View>(() => loadPreferences().defaultView);
  const [search, setSearch] = useState('');
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'github' | 'new-ticket' | 'search' | null>(null);

  const tickets = useMemo(
    () => board.workspaces.flatMap((w) => (w.tree ? ticketsOf(w.store.id, w.store.label, w.tree, w.store.capabilities.write) : [])),
    [board.workspaces],
  );
  const me = loadAuthor().name === 'board user' ? '' : loadAuthor().name.trim().toLowerCase();
  const inScope = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets.filter((t) =>
      t.leaf.state !== 'dropped' &&
      (!scope.workspaceId || t.workspaceId === scope.workspaceId) &&
      (!scope.initiative || t.initiative?.slug === scope.initiative) &&
      (!scope.epic || (scope.epic === 'backlog' ? t.leaf.folder === 'backlog' : t.epic?.slug === scope.epic)) &&
      (!mineOnly || (!!me && t.leaf.plan?.assignee?.trim().toLowerCase() === me)) &&
      (!q || `${t.ref} ${t.leaf.title} ${t.leaf.plan?.assignee ?? ''} ${t.epic?.title ?? ''} ${t.leaf.type}`.toLowerCase().includes(q)),
    );
  }, [tickets, scope, search, mineOnly, me]);
  const selected: Ticket | null = tickets.find((t) => t.uid === selectedUid) ?? null;
  const [expanded, setExpanded] = useState(false);

  // The open ticket lives in the URL (#ticket=<ref>&full=1) so a full-page ticket can be linked and survives reloads.
  const [pendingRef, setPendingRef] = useState(() => readHash());
  useEffect(() => {
    if (!pendingRef.ref || tickets.length === 0) return;
    const hit = tickets.find((t) => t.ref === pendingRef.ref && (!pendingRef.ws || t.workspace === pendingRef.ws)) ?? tickets.find((t) => t.ref === pendingRef.ref);
    if (hit) {
      setSelectedUid(hit.uid);
      setExpanded(pendingRef.full);
    }
    setPendingRef({ full: false });
  }, [tickets, pendingRef]);
  useEffect(() => {
    if (pendingRef.ref) return;
    const ws = selected && board.workspaces.length > 1 ? `&ws=${encodeURIComponent(selected.workspace)}` : '';
    const hash = selected ? `#ticket=${encodeURIComponent(selected.ref)}${ws}${expanded ? '&full=1' : ''}` : '';
    if (location.hash !== hash) history.replaceState(null, '', hash || location.pathname + location.search);
  }, [selected, expanded, pendingRef, board.workspaces.length]);

  const select = (uid: string | null) => {
    setSelectedUid(uid);
    if (!uid) setExpanded(false);
  };

  return { board, preferences, mineOnly, setMineOnly, scope, setScope, view, setView, search, setSearch, tickets, inScope, selected, select, expanded, setExpanded, dialog, setDialog };
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
