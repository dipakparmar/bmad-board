/**
 * Turns typed TicketChanges into file writes, following the repo-store rules in BMAD's board.md:
 * status, assignee and blocks go to the plan; entry fields go to tickets.toml; bodies to the leaf file.
 */
import type { BreakdownEntry, Leaf, TicketChange, TicketTree } from '../domain';
import { replaceBody, setFrontmatter } from './frontmatter';
import { joinPath, type FileSource, type FileWrite } from './file-source';
import { allLeaves, titleSlug } from './load-tree';
import { appendTable, findTable, joinTables, reorderTables, setKey, splitTables, tableId, type TomlValue } from './toml-edit';

export class ChangeError extends Error {}

const ENTRY_KEYS: Record<keyof Omit<BreakdownEntry, 'id'>, string> = {
  type: 'type', title: 'title', description: 'description', verify: 'verify', covers: 'covers', after: 'after',
  hitl: 'hitl', risk: 'risk', estimate: 'estimate', unknown: 'unknown', references: 'references', notes: 'notes',
  refine: 'refine', planCheckpoint: 'plan_checkpoint', doneCheckpoint: 'done_checkpoint',
};

/** `<type>-<slug>` the leaf's file has or would have, with `-<id>` when another leaf in the folder takes the name. */
export function leafStem(leaf: Leaf, siblings: Leaf[]): string {
  if (leaf.file) return leaf.file.path.slice(leaf.file.path.lastIndexOf('/') + 1, -3);
  const stem = `${leaf.type}-${titleSlug(leaf.title)}`;
  const taken = new Set<string>();
  for (const o of siblings) {
    if (o === leaf) break;
    if (!o.file) taken.add(`${o.type}-${titleSlug(o.title)}`);
  }
  for (const o of siblings) if (o.file) taken.add(o.file.path.slice(o.file.path.lastIndexOf('/') + 1, -3));
  return taken.has(stem) ? `${stem}-${leaf.id}` : stem;
}

export function planPath(leaf: Leaf, tree: TicketTree): string {
  if (leaf.plan) return leaf.plan.path;
  const siblings = allLeaves(tree).filter((l) => l.dir === leaf.dir);
  return joinPath(leaf.dir, `${leafStem(leaf, siblings)}-plan.md`);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function toToml(value: unknown): TomlValue | undefined {
  if (value === undefined || value === null || value === '' || value === false) return undefined;
  if (Array.isArray(value)) return value.length ? (value as (string | number)[]) : undefined;
  return value as TomlValue;
}

/** Plans one batch of changes. Reads each file at most once and applies later changes on top of earlier ones. */
export async function planChanges(tree: TicketTree, src: FileSource, changes: TicketChange[]): Promise<FileWrite[]> {
  if (tree.layout === 'v6') throw new ChangeError('This project uses the v6 layout, which the board shows read-only. Run `bmad migrate method` to edit it here.');
  const leaves = new Map(allLeaves(tree).map((l) => [l.key, l]));
  const pending = new Map<string, string | null>();
  const read = async (path: string) => (pending.has(path) ? pending.get(path) ?? null : src.read(path));
  const write = (path: string, text: string | null) => pending.set(path, text);
  const leafOf = (key: string) => {
    const leaf = leaves.get(key);
    if (!leaf) throw new ChangeError(`No ticket ${key}`);
    return leaf;
  };

  for (const change of changes) {
    switch (change.kind) {
      case 'mark': {
        if (tree.tracker !== 'repo') throw new ChangeError(`Tickets are tracked in ${tree.tracker}; change status there or through the PO agent.`);
        const leaf = leafOf(change.key);
        const path = planPath(leaf, tree);
        const blocked = change.status === 'blocked' || change.blockedReason !== undefined;
        // `mark` without a reason clears the block, as tickets.py does; assignee changes only when given.
        const fields: Record<string, string | undefined> = {
          status: change.status,
          blocked_at: blocked ? today() : undefined,
          blocked_reason: blocked ? change.blockedReason ?? 'blocked from the board' : undefined,
        };
        if (change.assignee !== undefined) fields.assignee = change.assignee || undefined;
        const existing = await read(path);
        if (existing === null) {
          const ticket = leaf.id ?? leaf.key.slice(leaf.key.indexOf('/') + 1).replace(/\.md$/, '');
          write(path, setFrontmatter('', { title: leaf.title, ticket, ...fields }));
        } else {
          write(path, setFrontmatter(existing, fields));
        }
        break;
      }
      case 'clear-block': {
        const leaf = leafOf(change.key);
        const path = planPath(leaf, tree);
        const existing = await read(path);
        if (existing !== null) write(path, setFrontmatter(existing, { blocked_at: undefined, blocked_reason: undefined, ...(leaf.status === 'blocked' ? { status: 'in-progress' } : {}) }));
        break;
      }
      case 'edit-entry': {
        const leaf = leafOf(change.key);
        if (leaf.id === null || leaf.folder === 'backlog') throw new ChangeError(`${change.key} has no tickets.toml entry`);
        const path = joinPath(leaf.dir, 'tickets.toml');
        const doc = splitTables((await read(path)) ?? '');
        const table = findTable(doc, 'entry', leaf.id);
        if (!table) throw new ChangeError(`${path} has no entry ${leaf.id}`);
        for (const [field, value] of Object.entries(change.patch)) {
          const key = ENTRY_KEYS[field as keyof typeof ENTRY_KEYS];
          if (key) setKey(table, key, toToml(value));
        }
        write(path, joinTables(doc));
        // `after` and `hitl` live in both places once a leaf file exists.
        if (leaf.file && ('after' in change.patch || 'hitl' in change.patch)) {
          const text = await read(leaf.file.path);
          if (text !== null) {
            const after = change.patch.after;
            write(leaf.file.path, setFrontmatter(text, {
              ...('hitl' in change.patch ? { hitl: !!change.patch.hitl } : {}),
              ...(after ? { after } : {}),
            }));
          }
        }
        break;
      }
      case 'add-entry': {
        const folderDir = folderTicketsDir(tree, change.folder);
        const path = joinPath(folderDir, 'tickets.toml');
        const doc = splitTables((await read(path)) ?? '');
        const ids = doc.tables.filter((t) => t.kind === 'entry').map((t) => Number.parseInt(tableId(t) ?? '0', 10)).filter(Number.isFinite);
        const floor = Number(/^#?\s*next_id\s*=\s*(\d+)/m.exec(doc.preamble.join('\n'))?.[1] ?? 0);
        const id = Math.max(0, ...ids) + 1 > floor ? Math.max(0, ...ids) + 1 : floor;
        const e = change.entry;
        appendTable(doc, 'entry', {
          id, type: e.type, title: e.title, description: e.description, verify: toToml(e.verify), covers: e.covers,
          after: e.after, hitl: e.hitl, risk: toToml(e.risk), unknown: toToml(e.unknown), refine: toToml(e.refine),
        });
        write(path, joinTables(doc));
        break;
      }
      case 'reorder': {
        const path = joinPath(folderTicketsDir(tree, change.folder), 'tickets.toml');
        const doc = splitTables((await read(path)) ?? '');
        reorderTables(doc, 'entry', change.order);
        write(path, joinTables(doc));
        break;
      }
      case 'edit-body': {
        const text = await read(change.path);
        if (text === null) throw new ChangeError(`${change.path} does not exist`);
        write(change.path, replaceBody(text, change.body));
        break;
      }
      case 'file-bug': {
        const dir = joinPath(tree.outputFolder, 'backlog');
        const path = joinPath(dir, `bug-${titleSlug(change.title)}.md`);
        if ((await read(path)) !== null) throw new ChangeError(`${path} exists already`);
        const front = setFrontmatter('', { tracker_id: '', id: '', type: 'bug', title: change.title, refined: false, hitl: false, risk: 'medium' });
        write(path, `${front}\n# ${change.title}\n\n## Description\n\n${change.body.trim()}\n`);
        break;
      }
    }
  }
  return [...pending].map(([path, text]) => ({ path, text }));
}

function folderTicketsDir(tree: TicketTree, folder: string): string {
  for (const i of tree.initiatives) {
    if (i.slug === folder) return joinPath(i.path.slice(0, i.path.lastIndexOf('/')), 'tickets');
    const epic = i.epics.find((e) => e.slug === folder);
    if (epic) return joinPath(epic.path.slice(0, epic.path.lastIndexOf('/')), 'tickets');
  }
  throw new ChangeError(`No epic or initiative ${folder}`);
}
