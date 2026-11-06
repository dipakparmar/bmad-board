/** Flattens loaded trees into the rows the board and list render. */
import type { BoardState, Epic, Initiative, Leaf, TicketTree } from '../domain';
import { allLeaves } from '../store';

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
  const readOnly = !writable || tree.layout === 'v6' || tree.tracker !== 'repo';
  return allLeaves(tree).map((leaf) => {
    const { initiative, epic } = where.get(leaf.key) ?? {};
    const ref = epic?.id !== undefined && leaf.id !== null ? `${epic.id}.${leaf.id}` : leaf.id !== null ? String(leaf.id) : leaf.key.slice(leaf.key.indexOf('/') + 1).replace(/\.md$/, '');
    return { uid: `${workspaceId}::${leaf.key}`, workspaceId, workspace, ref, leaf, initiative, epic, readOnly };
  });
}

export function summaryOf(leaf: Leaf): string {
  const text = leaf.entry?.description || leaf.file?.body.replace(/^#.*$/gm, '').replace(/[`*_>#|]/g, '').replace(/\s+/g, ' ').trim() || '';
  return text.slice(0, 190);
}

export function bodyOf(leaf: Leaf): string {
  if (leaf.file) return leaf.file.body.replace(/^#\s+.+(?:\r?\n)+/, '');
  const e = leaf.entry;
  if (!e) return '';
  return [e.description, e.verify && `**Verify:** ${e.verify}`, e.unknown && `**Unknown:** ${e.unknown}`, ...(e.notes ?? []).map((n) => `- ${n}`)].filter(Boolean).join('\n\n');
}
