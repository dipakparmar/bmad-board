/**
 * Filters shared by every view: board, list, dependencies, stand-up and what's next all show the same
 * tickets. They live in the URL (so a filtered view can be linked) and the last ones used are kept in
 * this browser for next time.
 *
 * Within a facet, values are "any of"; across facets, "all of". An empty facet does not filter.
 */
import type { BoardState, LeafType, Risk } from '../domain';
import type { Readiness, Ticket } from './view-model';

export interface Filters {
  /** Current dated sprint by default; all, unscheduled, or an explicit sprint id. */
  sprint?: string;
  states: BoardState[];
  readiness: Readiness[];
  /** Assignee names, lower-cased; `-` means unassigned. */
  who: string[];
  /** People, agents, or everyone (by the board's agent list). */
  kind: 'all' | 'people' | 'agents';
  types: LeafType[];
  risk: Risk[];
  /** Initiative slugs. */
  initiatives: string[];
  /** Epics as `<initiative>/<epic slug>`. */
  epics: string[];
  /** Needs a person (hitl). */
  hitl: boolean;
  /** Leave done tickets out. */
  hideDone: boolean;
}

export const NO_FILTERS: Filters = { states: [], readiness: [], who: [], kind: 'all', types: [], risk: [], initiatives: [], epics: [], hitl: false, hideDone: false };

export const UNASSIGNED = '-';

const assignee = (t: Ticket) => t.leaf.plan?.assignee?.trim().toLowerCase() || UNASSIGNED;
export const epicId = (t: Ticket) => (t.epic ? `${t.initiative?.slug ?? ''}/${t.epic.slug}` : '');

/** Whether a ticket passes the filters. `isAgent` says whether an assignee is an agent. */
export function matches(t: Ticket, f: Filters, isAgent: (name: string) => boolean): boolean {
  if (f.hideDone && t.leaf.state === 'done') return false;
  if (f.states.length && !f.states.includes(t.leaf.state)) return false;
  if (f.readiness.length && !f.readiness.includes(t.readiness)) return false;
  if (f.who.length && !f.who.includes(assignee(t))) return false;
  if (f.kind !== 'all') {
    const a = assignee(t);
    if (a === UNASSIGNED || isAgent(a) !== (f.kind === 'agents')) return false;
  }
  if (f.types.length && !f.types.includes(t.leaf.type)) return false;
  if (f.risk.length && !(t.leaf.risk && f.risk.includes(t.leaf.risk))) return false;
  if (f.initiatives.length && !f.initiatives.includes(t.initiative?.slug ?? '')) return false;
  if (f.epics.length && !f.epics.includes(epicId(t))) return false;
  if (f.hitl && !t.leaf.hitl) return false;
  return true;
}

export function activeCount(f: Filters): number {
  return f.states.length + f.readiness.length + f.who.length + f.types.length + f.risk.length + f.initiatives.length + f.epics.length + Number(f.kind !== 'all') + Number(f.hitl) + Number(f.hideDone);
}

// URL form: short keys, comma lists. `done=0` hides done tickets.
const KEYS = { states: 'st', readiness: 'rd', who: 'who', types: 'type', risk: 'risk', initiatives: 'in', epics: 'ep' } as const;

export function filtersToParams(f: Filters, p = new URLSearchParams()): URLSearchParams {
  for (const [field, key] of Object.entries(KEYS) as [keyof typeof KEYS, string][]) {
    if (f[field].length) p.set(key, f[field].join(','));
  }
  if (f.sprint && f.sprint !== 'current') p.set('sp', f.sprint);
  if (f.kind !== 'all') p.set('kind', f.kind);
  if (f.hitl) p.set('hitl', '1');
  if (f.hideDone) p.set('done', '0');
  return p;
}

/** Filters from URL params, or null when the URL carries none. */
export function filtersFromParams(p: URLSearchParams): Filters | null {
  const any = [...Object.values(KEYS), 'sp', 'kind', 'hitl', 'done'].some((k) => p.has(k));
  if (!any) return null;
  const list = (k: string) => (p.get(k) ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return {
    ...(p.has('sp') ? { sprint: p.get('sp') || 'current' } : {}),
    states: list(KEYS.states) as BoardState[],
    readiness: list(KEYS.readiness) as Readiness[],
    who: list(KEYS.who).map((w) => w.toLowerCase()),
    kind: p.get('kind') === 'people' || p.get('kind') === 'agents' ? (p.get('kind') as Filters['kind']) : 'all',
    types: list(KEYS.types) as LeafType[],
    risk: list(KEYS.risk) as Risk[],
    initiatives: list(KEYS.initiatives),
    epics: list(KEYS.epics),
    hitl: p.get('hitl') === '1',
    hideDone: p.get('done') === '0',
  };
}

export interface Facet {
  value: string;
  label: string;
  count: number;
}

/** The values each facet can take in these tickets, with counts, for the filter menu. */
export function facets(tickets: Ticket[]): { who: Facet[]; initiatives: Facet[]; epics: Facet[] } {
  const who = new Map<string, Facet>();
  const initiatives = new Map<string, Facet>();
  const epics = new Map<string, Facet>();
  const bump = (m: Map<string, Facet>, value: string, label: string) => {
    const f = m.get(value);
    if (f) f.count++;
    else m.set(value, { value, label, count: 1 });
  };
  for (const t of tickets) {
    const a = assignee(t);
    bump(who, a, a === UNASSIGNED ? 'Unassigned' : t.leaf.plan?.assignee?.trim() ?? a);
    if (t.initiative) bump(initiatives, t.initiative.slug, t.initiative.title);
    if (t.epic) bump(epics, epicId(t), t.epic.title);
  }
  const byCount = (a: Facet, b: Facet) => b.count - a.count || a.label.localeCompare(b.label);
  return { who: [...who.values()].sort(byCount), initiatives: [...initiatives.values()], epics: [...epics.values()] };
}

/** Ticket count above which the board opens with done tickets hidden, unless the person chose otherwise. */
export const LARGE_PROJECT = 300;
