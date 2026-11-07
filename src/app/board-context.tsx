import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { isAgent, membersFromAssignees, mergeMembers, type Member, type DocLink } from '@/domain';
import { filtersFromParams, filtersToParams, LARGE_PROJECT, matches, NO_FILTERS, type Filters } from './filters';
import { createPersonResolver, resolveMembers } from '@/domain/identities';
import { matchesSprint } from '@/domain/sprints';
import { workspaceLoadState } from './loading-state';
import { resolveTicketPeople } from './ticket-people';
import { useIdentitySettings } from './identity-settings';
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

const VIEWS: View[] = ['board', 'list', 'next', 'standup', 'graph', 'docs', 'settings'];

/** Where the board is, as the URL hash holds it. */
interface Place {
  view?: View;
  /** Project label, initiative slug, epic slug: the sidebar scope. */
  project?: string;
  initiative?: string;
  epic?: string;
  ref?: string;
  ws?: string;
  init?: string;
  full: boolean;
  doc?: string;
  commit?: string;
  /** Dependency view focus, `ticket:<key>` or `epic:<folder>`. */
  focus?: string;
}

function readHash(hash = location.hash): Place {
  const p = new URLSearchParams(hash.slice(1));
  const get = (k: string) => p.get(k) ?? undefined;
  const v = get('v') as View | undefined;
  return {
    view: get('doc') ? 'docs' : v && VIEWS.includes(v) ? v : undefined,
    project: get('p'), initiative: get('i'), epic: get('e'),
    ref: get('ticket'), ws: get('ws'), init: get('init'), full: p.get('full') === '1',
    doc: get('doc'), commit: get('commit'), focus: get('gf'),
  };
}

/**
 * The part of the hash that is a place to go back to: view, scope, open ticket, doc, commit and graph
 * focus. A change there adds a browser history entry; a change to filters alone only replaces it.
 */
const NAV_KEYS = ['v', 'p', 'i', 'e', 'ticket', 'full', 'doc', 'commit', 'gf'];
function navOf(hash: string): string {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  return NAV_KEYS.map((k) => `${k}=${p.get(k) ?? ''}`).join('&');
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
  const identities = useIdentitySettings();
  const [remotePeople, setRemotePeople] = useState<Record<string, Member[]>>({});
  useEffect(() => {
    let live = true;
    void Promise.all(board.workspaces.map(async (w) => [w.store.id, await w.store.people().catch(() => [] as Member[])] as const)).then((entries) => {
      if (live) setRemotePeople(Object.fromEntries(entries));
    });
    return () => { live = false; };
  }, [board.workspaces]);
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
  const [view, setView] = useState<View>(() => readHash().view ?? loadPreferences().defaultView);
  const [doc, setDoc] = useState<OpenDoc | null>(null);
  const [commit, setCommit] = useState<OpenCommit | null>(null);
  const [search, setSearch] = useState('');
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'github' | 'new-ticket' | 'search' | null>(null);

  const rawTickets = useMemo(
    () => board.workspaces.flatMap((w) => (w.tree ? ticketsOf(w.store.id, w.store.label, w.tree, w.store.capabilities.write) : [])),
    [board.workspaces],
  );
  const rawPeople = useMemo(() => Object.fromEntries(board.workspaces.map((w) => [w.store.id, mergeMembers(
    remotePeople[w.store.id] ?? [],
    membersFromAssignees([
      ...rawTickets.filter((t) => t.workspaceId === w.store.id).flatMap((t) => [t.leaf.plan?.assignee, t.leaf.owner]),
      ...(w.tree?.sprint?.actionItems.map((a) => a.owner) ?? []),
      ...(w.tree?.initiatives.flatMap((i) => [i.owner, ...i.epics.map((e) => e.owner)]) ?? []),
    ]),
  )])), [board.workspaces, remotePeople, rawTickets]);
  const people = useMemo(() => Object.fromEntries(Object.entries(rawPeople).map(([id, members]) => [id, resolveMembers(members, identities.settings[id] ?? [])])), [rawPeople, identities.settings]);
  const resolvePerson = useMemo(() => {
    const resolvers = new Map(board.workspaces.map((w) => [w.store.id, createPersonResolver(
      (people[w.store.id] ?? []).map((m) => ({ ...m, agent: m.agent || isAgent(m.name, w.tree?.board) })),
      identities.settings[w.store.id] ?? [],
    )]));
    return (workspaceId: string, name: string) => resolvers.get(workspaceId)?.(name);
  }, [board.workspaces, identities.settings, people]);
  const tickets = useMemo(() => rawTickets.map((t) => resolveTicketPeople(t, (name) => resolvePerson(t.workspaceId, name))), [rawTickets, resolvePerson]);
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
      (!mineOnly || (!!me && t.leaf.plan?.assignee?.trim().toLowerCase() === (resolvePerson(t.workspaceId, me)?.name.toLowerCase() ?? me))) &&
      matchesSprint(t.leaf.sprint, filters.sprint, board.workspaces.find((w) => w.store.id === t.workspaceId)?.tree?.sprints ?? []) &&
      matches(t, { ...filters, who: filters.who.map((name) => resolvePerson(t.workspaceId, name)?.name.toLowerCase() ?? name) }, (name) => resolvePerson(t.workspaceId, name)?.agent ?? ((people[t.workspaceId] ?? []).find((m) => m.name.toLowerCase() === name.toLowerCase())?.agent || agentCheck(name))) &&
      (!q || `${t.ref} ${t.leaf.title} ${t.leaf.plan?.assignee ?? ''} ${t.epic?.title ?? ''} ${t.leaf.type}`.toLowerCase().includes(q)),
    );
  }, [tickets, scope, search, mineOnly, me, filters, agentCheck, resolvePerson, people, board.workspaces]);
  const loadState = workspaceLoadState(board.workspaces, scope.workspaceId, board.initializing);
  const selected: Ticket | null = tickets.find((t) => t.uid === selectedUid) ?? null;
  const [expanded, setExpanded] = useState(false);

  // Where the board is lives in the URL hash, so views, tickets and docs can be linked, survive reloads,
  // and work with the browser's Back and Forward. `pending` is a place read from the URL that waits for
  // its projects to load before it can be shown.
  const [pending, setPending] = useState<Place | null>(() => readHash());
  const [graphFocus, setGraphFocus] = useState<string | null>(() => readHash().focus ?? null);
  useEffect(() => {
    if (!pending || board.workspaces.length === 0) return;
    // Wait for the tickets too when the place names one.
    if (pending.ref && tickets.length === 0 && board.workspaces.some((w) => !w.tree)) return;
    const byLabel = (label?: string) => (label ? board.workspaces.find((w) => w.store.label === label || w.store.label.split(' · ')[0] === label) : undefined);
    const ws = byLabel(pending.project);
    setScope(ws ? { workspaceId: ws.store.id, initiative: pending.initiative, epic: pending.epic } : {});
    setView(pending.view ?? loadPreferences().defaultView);
    setGraphFocus(pending.focus ?? null);
    const hit = pending.ref
      ? tickets.find((t) => t.ref === pending.ref && (!pending.ws || t.workspace === pending.ws) && (!pending.init || t.initiative?.slug === pending.init)) ?? tickets.find((t) => t.ref === pending.ref)
      : undefined;
    setSelectedUid(hit?.uid ?? null);
    setExpanded(!!hit && pending.full);
    const docWs = byLabel(pending.ws) ?? board.workspaces[0];
    setDoc((cur) => (pending.doc && docWs ? (cur?.link.candidates[0] === pending.doc ? cur : { workspaceId: docWs.store.id, link: { candidates: [pending.doc], label: 'document', kind: 'doc' } }) : null));
    const commitWs = byLabel(pending.ws) ?? board.workspaces.find((w) => w.store.source.commitDetail) ?? board.workspaces[0];
    setCommit(pending.commit && commitWs ? { workspaceId: commitWs.store.id, sha: pending.commit } : null);
    setPending(null);
  }, [board.workspaces, tickets, pending]);
  // The dependency view's focus belongs to it; leaving the view drops it.
  useEffect(() => {
    if (view !== 'graph') setGraphFocus(null);
  }, [view]);
  // Back and Forward: show the place the URL now holds, filters included.
  useEffect(() => {
    const onPop = () => {
      const place = readHash();
      setPending(place);
      const f = filtersFromParams(new URLSearchParams(location.hash.slice(1)));
      setFilterState((s) => ({ filters: f ?? NO_FILTERS, chosen: s.chosen }));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => {
    if (pending) return;
    const p = new URLSearchParams();
    if (view !== preferences.prefs.defaultView || view === 'docs') p.set('v', view);
    const scopeWs = board.workspaces.find((w) => w.store.id === scope.workspaceId);
    if (scopeWs) {
      p.set('p', scopeWs.store.label.split(' · ')[0] ?? scopeWs.store.label);
      if (scope.initiative) p.set('i', scope.initiative);
      if (scope.epic) p.set('e', scope.epic);
    }
    if (view === 'docs' && doc) {
      p.set('doc', doc.link.candidates[0] ?? '');
      if (board.workspaces.length > 1) p.set('ws', board.workspaces.find((w) => w.store.id === doc.workspaceId)?.store.label ?? '');
    }
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
    if (view === 'graph' && graphFocus) p.set('gf', graphFocus);
    filtersToParams(filters, p);
    const hash = p.size ? `#${p.toString().replaceAll('%2C', ',').replaceAll('%2F', '/').replaceAll('%3A', ':')}` : '';
    if (location.hash === hash) return;
    const url = hash || location.pathname + location.search;
    if (navOf(location.hash) === navOf(hash)) history.replaceState(null, '', url);
    else history.pushState(null, '', url);
  }, [selected, expanded, pending, board.workspaces, view, doc, filters, tickets, commit, scope, graphFocus, preferences.prefs.defaultView]);

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

  return { board, loadState, identities, rawPeople, people, resolvePerson, doc, setDoc, openDoc, graphFocus, setGraphFocus, commit, openCommit: (workspaceId: string, sha: string) => setCommit({ workspaceId, sha }), closeCommit: () => setCommit(null), closeDoc, preferences, mineOnly, setMineOnly, filters, setFilters, scope, setScope, view, setView, search, setSearch, tickets, inScope, selected, select, expanded, setExpanded, dialog, setDialog };
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
