/** Flattens loaded trees into the rows the board and list render. */
import { LEAF_STATUSES, V6_PICKABLE, whatsNext, type BoardState, type LeafStatus, type Epic, type Initiative, type Leaf, type TicketTree } from '../domain';
import { allLeaves, doneContainers } from '../store';

/** Where a ticket stands in BMAD's "what's next" grouping. */
export type Readiness = 'ready' | 'refine' | 'blocked' | 'active' | 'closed';

export interface Ticket {
  /** Unique across workspaces. */
  uid: string;
  workspaceId: string;
  workspace: string;
  /** What people call it: `1.2` for entry 2 of epic 1, or the backlog file name. */
  ref: string;
  leaf: Leaf;
  initiative?: Initiative;
  epic?: Epic;
  readOnly: boolean;
  readiness: Readiness;
  /** Unmet prerequisites (keys), or the reason it is blocked. */
  waitingOn: string[];
  blockedReason?: string;
}

export const COLUMNS: { id: BoardState; label: string; color: string }[] = [
  { id: 'backlog', label: 'Backlog', color: 'bg-neutral-300' },
  { id: 'in-progress', label: 'In progress', color: 'bg-violet-500' },
  { id: 'review', label: 'Review', color: 'bg-amber-500' },
  { id: 'done', label: 'Done', color: 'bg-emerald-500' },
];

export function ticketsOf(workspaceId: string, workspace: string, tree: TicketTree, writable: boolean): Ticket[] {
  const where = new Map<string, { initiative?: Initiative; epic?: Epic }>();
  for (const initiative of tree.initiatives) {
    for (const epic of initiative.epics) for (const l of epic.leaves) where.set(l.key, { initiative, epic });
    for (const l of initiative.leaves) where.set(l.key, { initiative });
  }
  const readOnly = !writable || tree.tracker !== 'repo';
  const next = whatsNext(allLeaves(tree), doneContainers(tree));
  const readiness = new Map<string, { r: Readiness; waitingOn: string[]; reason?: string }>();
  for (const l of next.readyToStart) readiness.set(l.key, { r: 'ready', waitingOn: [] });
  for (const l of next.readyToRefine) readiness.set(l.key, { r: 'refine', waitingOn: [] });
  for (const l of next.inProgress) readiness.set(l.key, { r: 'active', waitingOn: [] });
  for (const b of next.blocked) readiness.set(b.leaf.key, { r: 'blocked', waitingOn: b.waitingOn, reason: b.reason });
  return allLeaves(tree).map((sourceLeaf) => {
    // An owner can exist before a build plan. This projection never changes the store's write paths.
    const leaf = !sourceLeaf.plan && sourceLeaf.owner ? { ...sourceLeaf, plan: { path: '', ticket: String(sourceLeaf.id ?? ''), status: sourceLeaf.status, assignee: sourceLeaf.owner, body: '' } } : sourceLeaf;
    const ready = readiness.get(leaf.key) ?? { r: 'closed' as const, waitingOn: [] };
    const { initiative, epic } = where.get(leaf.key) ?? {};
    const ref = epic?.id !== undefined && leaf.id !== null ? `${epic.id}.${leaf.id}` : leaf.id !== null ? String(leaf.id) : leaf.key.slice(leaf.key.indexOf('/') + 1).replace(/\.md$/, '');
    return { uid: `${workspaceId}::${leaf.key}`, workspaceId, workspace, ref, leaf, initiative, epic, readOnly, readiness: ready.r, waitingOn: ready.waitingOn, blockedReason: ready.reason };
  });
}

export function summaryOf(leaf: Leaf): string {
  const text = leaf.entry?.description || leaf.file?.body.replace(/^#.*$/gm, '').replace(/[`*_>#|]/g, '').replace(/\s+/g, ' ').trim() || '';
  return text.slice(0, 190);
}

export function bodyOf(leaf: Leaf): string {
  if (leaf.file) return leaf.file.body.replace(/^\s*#\s+.+(?:\r?\n)+/, '');
  const e = leaf.entry;
  if (!e) return '';
  return [e.description, e.verify && `**Verify:** ${e.verify}`, e.unknown && `**Unknown:** ${e.unknown}`, ...(e.notes ?? []).map((n) => `- ${n}`)].filter(Boolean).join('\n\n');
}

/** `1.2`-style refs for keys, so people see what BMAD calls them. */
export function refOf(key: string, tickets: Ticket[]): string {
  const hit = tickets.find((t) => t.leaf.key === key);
  if (hit) return hit.ref;
  return key.startsWith('epic-') && !key.includes('/') ? key : key.replace(/^.*\//, '');
}

/** Statuses a person can set on this ticket: all of BMAD's, or v6's for a v6 story. */
export function statusesFor(ticket: Ticket): readonly LeafStatus[] {
  return ticket.leaf.v6 ? V6_PICKABLE : LEAF_STATUSES;
}
