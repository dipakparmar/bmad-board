/**
 * The dependency graph: which tickets wait on which. Edges come from `after` (ticket → ticket) and from
 * epic gates (an epic's `after`: every ticket in it waits for the other epic to be done). Nodes are laid
 * out in layers, so everything a ticket waits on sits to its left.
 */
import type { AfterRef, Leaf, TicketKey } from './ticket-tree';

export interface GraphEdge {
  from: TicketKey;
  to: TicketKey;
  /**
   * - `after`: a declared prerequisite between tickets;
   * - `gate`: an epic waits on another (its file's `after`, or its `after` in tickets.toml), drawn from
   *   the awaited epic's last tickets to the waiting epic's first;
   * - `noted`: a prerequisite the text names ("Prerequisites: Story 1.2"), not in `after`;
   * - `order`: build order only (the ticket or epic listed before it), inferred.
   */
  kind: EdgeKind;
}

export type EdgeKind = 'after' | 'gate' | 'noted' | 'order';

export const EDGE_LABELS: Record<EdgeKind, string> = {
  after: 'Waits on (after)',
  gate: 'Epic waits on epic',
  noted: 'Named in the ticket text',
  order: 'Build order (inferred)',
};

export interface GraphNode<T> {
  key: TicketKey;
  item: T;
  /** Column: the longest chain of prerequisites before it. */
  layer: number;
  /** Row within the column. */
  row: number;
}

export interface DependencyGraph<T> {
  nodes: GraphNode<T>[];
  edges: GraphEdge[];
  layers: number;
  /** Keys caught in a cycle; laid out as if the cycle's back edge were absent. */
  cyclic: TicketKey[];
}

/**
 * Builds the graph over `items` (any shape carrying a leaf). Prerequisites outside `items` are left out,
 * so a filtered view stays readable. With `connectedOnly`, tickets with no edges are dropped.
 */
export function dependencyGraph<T extends { leaf: Leaf }>(items: T[], { connectedOnly = false, order = true, noted = true } = {}): DependencyGraph<T> {
  const byKey = new Map(items.map((i) => [i.leaf.key, i]));
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  const add = (from: TicketKey, to: TicketKey, kind: GraphEdge['kind']) => {
    const id = `${from}>${to}`;
    if (from === to || seen.has(id) || !byKey.has(from) || !byKey.has(to)) return;
    // Inferred order never closes a loop: where the text says otherwise, the text wins.
    if (kind === 'order' && downstreamOf(to, edges).has(from)) return;
    if (kind === 'order' && downstreamOf(from, edges).has(to)) return;
    seen.add(id);
    edges.push({ from, to, kind });
  };
  for (const i of items) for (const a of i.leaf.after) add(a, i.leaf.key, 'after');

  // Epic gates: connect the gating epic's last tickets (ones nothing in that epic waits on) to the gated
  // epic's first tickets, rather than every pair, which would be unreadable.
  const byFolder = new Map<string, T[]>();
  for (const i of items) byFolder.set(i.leaf.folder, [...(byFolder.get(i.leaf.folder) ?? []), i]);
  // Inside an epic, build order counts as a link when it is shown, so its last ticket is the one listed last.
  const inside = (o: Leaf, k: TicketKey) => o.after.includes(k) || (order && o.links?.previous === k);
  const lastOf = (folder: string) => {
    const inFolder = byFolder.get(folder) ?? [];
    return inFolder.filter((i) => !inFolder.some((o) => inside(o.leaf, i.leaf.key)));
  };
  const firstsOf = (folder: string) => {
    const inFolder = byFolder.get(folder) ?? [];
    return inFolder.filter((i) => !inFolder.some((o) => inside(i.leaf, o.leaf.key)));
  };
  // An epic-level link is one arrow per pair of epics, from the awaited epic's last ticket in build order
  // to the waiting epic's first. Every last-to-every-first would swamp a big project.
  const sources = (ref: TicketKey) => (byFolder.has(ref) ? lastOf(ref).slice(-1).map((i) => i.leaf.key) : [ref]);
  for (const [folder, inFolder] of byFolder) {
    const lead = inFolder[0]?.leaf;
    const firsts = firstsOf(folder).slice(0, 1).map((i) => i.leaf.key);
    const epicEdges = (refs: TicketKey[] | undefined, kind: EdgeKind) => {
      for (const g of refs ?? []) for (const from of sources(g)) for (const to of firsts) add(from, to, kind);
    };
    epicEdges(lead?.gatedBy, 'gate');
    epicEdges(lead?.links?.epicAfter, 'gate');
    if (noted) epicEdges(lead?.links?.epicNoted, 'noted');
  }
  if (noted) for (const i of items) for (const k of i.leaf.links?.noted ?? []) add(k, i.leaf.key, 'noted');
  if (order) {
    // Build order last, so it only fills in where nothing stronger connects the pair. Within an epic only:
    // chaining epics end to start would line the whole project up in one row.
    for (const i of items) if (i.leaf.links?.previous) add(i.leaf.links.previous, i.leaf.key, 'order');
  }

  const connected = new Set(edges.flatMap((e) => [e.from, e.to]));
  const kept = connectedOnly ? items.filter((i) => connected.has(i.leaf.key)) : items;

  // Layers by longest path, with a DFS that notes cycles instead of looping on them.
  const preds = new Map<TicketKey, TicketKey[]>();
  for (const e of edges) preds.set(e.to, [...(preds.get(e.to) ?? []), e.from]);
  const layer = new Map<TicketKey, number>();
  const visiting = new Set<TicketKey>();
  const cyclic = new Set<TicketKey>();
  const depth = (k: TicketKey): number => {
    const known = layer.get(k);
    if (known !== undefined) return known;
    if (visiting.has(k)) {
      cyclic.add(k);
      return -1;
    }
    visiting.add(k);
    const d = Math.max(-1, ...(preds.get(k) ?? []).map(depth)) + 1;
    visiting.delete(k);
    layer.set(k, d);
    return d;
  };
  for (const i of kept) depth(i.leaf.key);

  // Rows: keep input order (epic, then build order) in the first column, then order each column by
  // the average row of its prerequisites, which keeps most edges short and uncrossed.
  const columns = new Map<number, T[]>();
  for (const i of kept) {
    const l = layer.get(i.leaf.key) ?? 0;
    columns.set(l, [...(columns.get(l) ?? []), i]);
  }
  const row = new Map<TicketKey, number>();
  const layers = columns.size ? Math.max(...columns.keys()) + 1 : 0;
  for (let l = 0; l < layers; l++) {
    const col = columns.get(l) ?? [];
    const order = new Map(col.map((i, n) => [i.leaf.key, n]));
    const bary = (i: T) => {
      const rs = (preds.get(i.leaf.key) ?? []).map((p) => row.get(p)).filter((r): r is number => r !== undefined);
      return rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : (order.get(i.leaf.key) ?? 0);
    };
    if (l > 0) col.sort((a, b) => bary(a) - bary(b) || (order.get(a.leaf.key) ?? 0) - (order.get(b.leaf.key) ?? 0));
    col.forEach((i, n) => row.set(i.leaf.key, n));
  }

  const keptKeys = new Set(kept.map((i) => i.leaf.key));
  return {
    nodes: kept.map((i) => ({ key: i.leaf.key, item: i, layer: layer.get(i.leaf.key) ?? 0, row: row.get(i.leaf.key) ?? 0 })),
    edges: edges.filter((e) => keptKeys.has(e.from) && keptKeys.has(e.to)),
    layers,
    cyclic: [...cyclic],
  };
}

/** Everything `key` waits on, directly or through others. */
export function upstreamOf(key: TicketKey, edges: GraphEdge[]): Set<TicketKey> {
  return walk(key, edges, (e) => [e.to, e.from]);
}

/** Everything that waits on `key`, directly or through others. */
export function downstreamOf(key: TicketKey, edges: GraphEdge[]): Set<TicketKey> {
  return walk(key, edges, (e) => [e.from, e.to]);
}

function walk(start: TicketKey, edges: GraphEdge[], dir: (e: GraphEdge) => [TicketKey, TicketKey]): Set<TicketKey> {
  const out = new Set<TicketKey>();
  const todo = [start];
  while (todo.length) {
    const k = todo.pop() as TicketKey;
    for (const e of edges) {
      const [here, next] = dir(e);
      if (here === k && !out.has(next)) {
        out.add(next);
        todo.push(next);
      }
    }
  }
  return out;
}

/** A ticket as the graph edits it: its leaf, and the ref people call it by (`1.2`). */
export interface Linkable {
  leaf: Leaf;
  ref: string;
}

/**
 * Why `target` cannot be made to wait on `prereq`, or null when it can. `after` lives in tickets.toml,
 * so both need an entry, and refs only resolve inside one initiative.
 */
export function cannotLink(target: Linkable, prereq: Linkable, edges: GraphEdge[]): string | null {
  if (target.leaf.key === prereq.leaf.key) return 'A ticket cannot wait on itself.';
  if (!target.leaf.entry || target.leaf.folder === 'backlog') return `${target.ref} is a backlog ticket, which has no tickets.toml entry to hold dependencies.`;
  if (!prereq.leaf.entry || prereq.leaf.folder === 'backlog') return `${prereq.ref} is a backlog ticket; only tickets in an epic can be waited on.`;
  if (target.leaf.initiative !== prereq.leaf.initiative) return 'Dependencies only reach tickets in the same initiative.';
  if (target.leaf.after.includes(prereq.leaf.key)) return `${target.ref} already waits on ${prereq.ref}.`;
  if (prereq.leaf.key === target.leaf.key || upstreamOf(prereq.leaf.key, edges).has(target.leaf.key)) return `${prereq.ref} already waits on ${target.ref}, so this would make a loop.`;
  return null;
}

/** How `target`'s tickets.toml writes a wait on `prereq`: a sibling id, or `"<epic>.<id>"` across epics. */
export function afterRefFor(target: Linkable, prereq: Linkable): AfterRef {
  return target.leaf.folder === prereq.leaf.folder && prereq.leaf.id !== null ? prereq.leaf.id : prereq.ref;
}

/** `target`'s entry `after`, plus `prereq`. */
export function afterWith(target: Linkable, prereq: Linkable): AfterRef[] {
  return [...(target.leaf.entry?.after ?? []), afterRefFor(target, prereq)];
}

/** `target`'s entry `after`, minus whichever ref resolves to `prereq`. Whole-epic refs are kept. */
export function afterWithout(target: Linkable, prereq: Linkable): AfterRef[] {
  const raw = target.leaf.entry?.after ?? [];
  return raw.filter((r) => {
    const s = String(r);
    if (s === prereq.ref) return false;
    if (target.leaf.folder === prereq.leaf.folder && s === String(prereq.leaf.id)) return false;
    return true;
  });
}

/** One epic in the epic-level view: its tickets, rolled up. */
export interface EpicNode<T> {
  folder: string;
  items: T[];
}

/** Links between epics, rolled up from the ticket links that cross them. */
export interface EpicEdge {
  from: string;
  to: string;
  /** How many ticket links it stands for, and of which kinds. */
  count: number;
  kinds: EdgeKind[];
}

/**
 * The epic-level view of a ticket graph, for projects too big to draw ticket by ticket: one node per
 * epic (or folder), one edge per pair of epics with any link between their tickets.
 */
export function epicGraph<T extends { leaf: Leaf }>(items: T[], edges: GraphEdge[]): { nodes: EpicNode<T>[]; edges: EpicEdge[] } {
  const folderOf = new Map(items.map((i) => [i.leaf.key, i.leaf.folder]));
  const nodes = new Map<string, EpicNode<T>>();
  for (const i of items) {
    const n = nodes.get(i.leaf.folder);
    if (n) n.items.push(i);
    else nodes.set(i.leaf.folder, { folder: i.leaf.folder, items: [i] });
  }
  const out = new Map<string, EpicEdge>();
  for (const e of edges) {
    const from = folderOf.get(e.from);
    const to = folderOf.get(e.to);
    if (!from || !to || from === to) continue;
    const id = `${from}>${to}`;
    const ee = out.get(id) ?? { from, to, count: 0, kinds: [] };
    ee.count++;
    if (!ee.kinds.includes(e.kind)) ee.kinds.push(e.kind);
    out.set(id, ee);
  }
  return { nodes: [...nodes.values()], edges: [...out.values()] };
}

/** Keys within `depth` links of `key`, either way (the ticket's neighbourhood). */
export function neighbourhood(key: TicketKey, edges: GraphEdge[], depth: number): Set<TicketKey> {
  const seen = new Set([key]);
  let frontier = new Set([key]);
  for (let d = 0; d < depth && frontier.size; d++) {
    const next = new Set<TicketKey>();
    for (const e of edges) {
      for (const [a, b] of [[e.from, e.to], [e.to, e.from]] as const) {
        if (frontier.has(a) && !seen.has(b)) {
          seen.add(b);
          next.add(b);
        }
      }
    }
    frontier = next;
  }
  return seen;
}
