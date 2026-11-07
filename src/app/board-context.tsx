import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { isAgent, type DocLink } from '@/domain';
import { filtersFromParams, filtersToParams, LARGE_PROJECT, matches, NO_FILTERS, type Filters } from './filters';
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

export type View = 'board' | 'list' | 'next' | 'standup' | 'graph' | 'docs' | 'settings';

/** A document open in the reader, and where to go back to. */
export interface OpenDoc {
  workspaceId: string;
  link: DocLink;
  back?: { view: View; ticketUid: string | null };
}

function readHash(): { ref?: string; ws?: string; init?: string; full: boolean; doc?: string; commit?: string } {
  const p = new URLSearchParams(location.hash.slice(1));
  return { ref: p.get('ticket') ?? undefined, ws: p.get('ws') ?? undefined, init: p.get('init') ?? undefined, full: p.get('full') === '1', doc: p.get('doc') ?? undefined, commit: p.get('commit') ?? undefined };
}

/** A commit open in the commit view. */
export interface OpenCommit {
  workspaceId: string;
  sha: string;
}

const FILTERS_KEY = 'bmad-board:filters';

/** Filters from the URL, else the ones last used in this browser, else none (null: never chosen). */
function initialFilters(): { filters: Filters; chosen: boolean } {
  const fromUrl = filtersFromParams(new URLSearchParams(location.hash.slice(1)));
  if (fromUrl) return { filters: fromUrl, chosen: true };
  try {
    const saved = JSON.parse(localStorage.getItem(FILTERS_KEY) ?? 'null') as Filters | null;
    if (saved) return { filters: { ...NO_FILTERS, ...saved }, chosen: true };
  } catch {
    /* storage can be blocked */
  }
  return { filters: NO_FILTERS, chosen: false };
}

function useBoardState() {
  const board = useBoard();
  const preferences = usePreferences();
  const [mineOnly, setMineOnly] = useState(false);
  const [scope, setScope] = useState<Scope>({});
  const [{ filters, chosen }, setFilterState] = useState(initialFilters);
  const setFilters = (update: Filters | ((f: Filters) => Filters)) => {
    setFilterState((s) => {
      const next = typeof update === 'function' ? update(s.filters) : update;
      try {
        localStorage.setItem(FILTERS_KEY, JSON.stringify(next));
      } catch {
        /* storage can be blocked */
      }
      return { filters: next, chosen: true };
    });
  };
  const [view, setView] = useState<View>(() => (readHash().doc ? 'docs' : loadPreferences().defaultView));
  const [doc, setDoc] = useState<OpenDoc | null>(null);
  const [commit, setCommit] = useState<OpenCommit | null>(null);
  const [search, setSearch] = useState('');
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'github' | 'new-ticket' | 'search' | null>(null);

  const tickets = useMemo(
    () => board.workspaces.flatMap((w) => (w.tree ? ticketsOf(w.store.id, w.store.label, w.tree, w.store.capabilities.write) : [])),
    [board.workspaces],
  );
  // A big project opens without its done tickets, until the person picks filters of their own.
  useEffect(() => {
    if (!chosen && tickets.length > LARGE_PROJECT) setFilterState({ filters: { ...NO_FILTERS, hideDone: true }, chosen: true });
  }, [chosen, tickets.length]);
  const agentCheck = useMemo(() => {
    const configs = board.workspaces.map((w) => w.tree?.board).filter((c): c is NonNullable<typeof c> => !!c);
    return (name: string) => (configs.length ? configs.some((c) => isAgent(name, c)) : isAgent(name));
  }, [board.workspaces]);
  const me = loadAuthor().name === 'board user' ? '' : loadAuthor().name.trim().toLowerCase();
  const inScope = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets.filter((t) =>
      t.leaf.state !== 'dropped' &&
      (!scope.workspaceId || t.workspaceId === scope.workspaceId) &&
      (!scope.initiative || t.initiative?.slug === scope.initiative) &&
      (!scope.epic || (scope.epic === 'backlog' ? t.leaf.folder === 'backlog' : t.epic?.slug === scope.epic)) &&
      (!mineOnly || (!!me && t.leaf.plan?.assignee?.trim().toLowerCase() === me)) &&
      matches(t, filters, agentCheck) &&
      (!q || `${t.ref} ${t.leaf.title} ${t.leaf.plan?.assignee ?? ''} ${t.epic?.title ?? ''} ${t.leaf.type}`.toLowerCase().includes(q)),
    );
  }, [tickets, scope, search, mineOnly, me, filters, agentCheck]);
  const selected: Ticket | null = tickets.find((t) => t.uid === selectedUid) ?? null;
  const [expanded, setExpanded] = useState(false);

  // The open ticket lives in the URL (#ticket=<ref>&full=1) so a full-page ticket can be linked and survives reloads.
  const [pendingRef, setPendingRef] = useState(() => readHash());
  useEffect(() => {
    if (!pendingRef.ref || tickets.length === 0) return;
    const hit = tickets.find((t) => t.ref === pendingRef.ref && (!pendingRef.ws || t.workspace === pendingRef.ws) && (!pendingRef.init || t.initiative?.slug === pendingRef.init)) ?? tickets.find((t) => t.ref === pendingRef.ref);
    if (hit) {
      setSelectedUid(hit.uid);
      setExpanded(pendingRef.full);
    }
    setPendingRef({ full: false });
  }, [tickets, pendingRef]);
  // #doc=<path> opens that document once its project has loaded.
  const [pendingDoc, setPendingDoc] = useState(() => readHash());
  useEffect(() => {
    if (!pendingDoc.doc || board.workspaces.length === 0) return;
    const ws = board.workspaces.find((w) => w.store.label === pendingDoc.ws) ?? board.workspaces[0];
    if (ws) setDoc({ workspaceId: ws.store.id, link: { candidates: [pendingDoc.doc], label: 'document', kind: 'doc' } });
    setPendingDoc({ full: false });
  }, [board.workspaces, pendingDoc]);
  // #commit=<sha> opens the commit view once a project with history has loaded.
  const [pendingCommit, setPendingCommit] = useState(() => readHash().commit);
  useEffect(() => {
    if (!pendingCommit || board.workspaces.length === 0) return;
    const ws = board.workspaces.find((w) => w.store.label === readHash().ws) ?? board.workspaces.find((w) => w.store.source.commitDetail) ?? board.workspaces[0];
    if (ws) setCommit({ workspaceId: ws.store.id, sha: pendingCommit });
    setPendingCommit(undefined);
  }, [board.workspaces, pendingCommit]);
  useEffect(() => {
    if (pendingRef.ref || pendingDoc.doc || pendingCommit) return;
    if (view === 'docs' && doc && !selected) {
      const ws = board.workspaces.length > 1 ? `&ws=${encodeURIComponent(board.workspaces.find((w) => w.store.id === doc.workspaceId)?.store.label ?? '')}` : '';
      const hash = `#doc=${encodeURIComponent(doc.link.candidates[0] ?? '')}${ws}`;
      if (location.hash !== hash) history.replaceState(null, '', hash);
      return;
    }
    const p = new URLSearchParams();
    if (selected) {
      p.set('ticket', selected.ref);
      if (board.workspaces.length > 1) p.set('ws', selected.workspace);
      // Refs restart in each initiative, so name it when the ref alone is ambiguous.
      if (selected.initiative && tickets.some((t) => t.ref === selected.ref && t.uid !== selected.uid)) p.set('init', selected.initiative.slug);
      if (expanded) p.set('full', '1');
    }
    if (commit) {
      p.set('commit', commit.sha);
      if (board.workspaces.length > 1 && !p.has('ws')) p.set('ws', board.workspaces.find((w) => w.store.id === commit.workspaceId)?.store.label ?? '');
    }
    filtersToParams(filters, p);
    const hash = p.size ? `#${p.toString().replaceAll('%2C', ',').replaceAll('%2F', '/')}` : '';
    if (location.hash !== hash) history.replaceState(null, '', hash || location.pathname + location.search);
  }, [selected, expanded, pendingRef, pendingDoc, pendingCommit, board.workspaces, view, doc, filters, tickets, commit]);

  /** Opens a doc in the reader, remembering the view and ticket to come back to. */
  const openDoc = (workspaceId: string, link: DocLink) => {
    setDoc({ workspaceId, link, back: view === 'docs' ? doc?.back : { view, ticketUid: selectedUid } });
    setSelectedUid(null);
    setExpanded(false);
    setView('docs');
  };
  const closeDoc = () => {
    const back = doc?.back;
    setDoc(null);
    if (back) {
      setView(back.view);
      setSelectedUid(back.ticketUid);
    }
  };

  const select = (uid: string | null) => {
    setSelectedUid(uid);
    if (!uid) setExpanded(false);
  };

  return { board, doc, setDoc, openDoc, commit, openCommit: (workspaceId: string, sha: string) => setCommit({ workspaceId, sha }), closeCommit: () => setCommit(null), closeDoc, preferences, mineOnly, setMineOnly, filters, setFilters, scope, setScope, view, setView, search, setSearch, tickets, inScope, selected, select, expanded, setExpanded, dialog, setDialog };
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
