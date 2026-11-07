/**
 * The dependency graph: which tickets wait on which. Edges come from `after` (ticket → ticket) and from
 * epic gates (an epic's `after`: every ticket in it waits for the other epic to be done). Nodes are laid
 * out in layers, so everything a ticket waits on sits to its left.
 */
import type { AfterRef, Leaf, TicketKey } from './ticket-tree';

export interface GraphEdge {
  from: TicketKey;
  to: TicketKey;
  /** `after` between tickets, or an epic gate drawn from the gating epic's last tickets. */
  kind: 'after' | 'gate';
}

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
export function dependencyGraph<T extends { leaf: Leaf }>(items: T[], { connectedOnly = false } = {}): DependencyGraph<T> {
  const byKey = new Map(items.map((i) => [i.leaf.key, i]));
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  const add = (from: TicketKey, to: TicketKey, kind: GraphEdge['kind']) => {
    const id = `${from}>${to}`;
    if (from === to || seen.has(id) || !byKey.has(from) || !byKey.has(to)) return;
    seen.add(id);
    edges.push({ from, to, kind });
  };
  for (const i of items) for (const a of i.leaf.after) add(a, i.leaf.key, 'after');

  // Epic gates: connect the gating epic's last tickets (ones nothing in that epic waits on) to the gated
  // epic's first tickets, rather than every pair, which would be unreadable.
  const byFolder = new Map<string, T[]>();
  for (const i of items) byFolder.set(i.leaf.folder, [...(byFolder.get(i.leaf.folder) ?? []), i]);
  const lastOf = (folder: string) => {
    const inFolder = byFolder.get(folder) ?? [];
    const keys = new Set(inFolder.map((i) => i.leaf.key));
    return inFolder.filter((i) => !inFolder.some((o) => o.leaf.after.includes(i.leaf.key) && keys.has(o.leaf.key)));
  };
  for (const [folder, inFolder] of byFolder) {
    const gates = inFolder[0]?.leaf.gatedBy ?? [];
    const firsts = inFolder.filter((i) => !i.leaf.after.some((a) => byFolder.get(folder)?.some((o) => o.leaf.key === a)));
    for (const g of gates) for (const from of lastOf(g)) for (const to of firsts) add(from.leaf.key, to.leaf.key, 'gate');
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
