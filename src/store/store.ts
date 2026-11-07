import type { ChangeAuthor, ChangeResult, TicketChange, TicketStore, TicketTree } from '../domain';
import { planChanges } from './changes';
import type { FileSource } from './file-source';
import { loadTicketTree } from './load-tree';
import { loadWithSnapshot } from './snapshot';

/** Commit message in the repo's conventional style, with who made the change as a trailer. */
export function commitMessage(changes: TicketChange[], author: ChangeAuthor, message?: string): string {
  const summary = message ?? (changes.length === 1 ? describe(changes[0] as TicketChange) : `update ${changes.length} tickets`);
  return `chore(tickets): ${summary}\n\nChanged-by: ${author.kind}:${author.name} via bmad-board`;
}

function describe(c: TicketChange): string {
  switch (c.kind) {
    case 'mark': return `mark ${c.key} ${c.status}`;
    case 'clear-block': return `unblock ${c.key}`;
    case 'board-config': return 'update board settings';
    case 'standup-notes': return `stand-up notes ${c.path.split('/').pop()?.replace(/^standup-|\.md$/g, '')}`;
    case 'assign': return c.assignee ? `assign ${c.key} to ${c.assignee}` : `unassign ${c.key}`;
    case 'edit-entry': return `edit ${c.key}`;
    case 'add-entry': return `add "${c.entry.title}" to ${c.folder}`;
    case 'reorder': return `reorder ${c.folder}`;
    case 'edit-body': return `edit ${c.path}`;
    case 'toggle-task': return `${c.checked ? 'tick' : 'untick'} task ${c.index + 1} of ${c.key}`;
    case 'file-bug': return `file bug "${c.title}"`;
  }
}

/** A TicketStore over any FileSource: the shared loader and planner plus the source's own commit. */
/** Bump when the parsed tree's shape changes, so trees cached by an older board are not reused. */
const TREE_FORMAT = 4;

export class FileTicketStore implements TicketStore {
  private tree: TicketTree | null = null;

  constructor(readonly source: FileSource) {}

  get id() { return this.source.id; }
  get label() { return this.source.label; }
  get capabilities() { return this.source.capabilities; }

  /** Whether the last load reused the cached tree because nothing it reads had changed. */
  lastLoadReused = false;

  async load(): Promise<TicketTree> {
    const { value, reused } = await loadWithSnapshot(this.source, `tree:${TREE_FORMAT}:${this.source.id}`, loadTicketTree);
    this.tree = value;
    this.lastLoadReused = reused;
    return this.tree;
  }

  async apply(changes: TicketChange[], author: ChangeAuthor, message?: string): Promise<ChangeResult> {
    if (!this.source.commit || !this.capabilities.write) throw new Error(`${this.label} is read-only`);
    const tree = this.tree ?? (await this.load());
    const files = await planChanges(tree, this.source, changes);
    if (files.length === 0) return { paths: [] };
    const result = await this.source.commit(files, commitMessage(changes, author, message), author);
    this.tree = null;
    return result;
  }

  history(path: string, limit?: number) {
    return this.source.history?.(path, limit) ?? Promise.resolve([]);
  }

  commitDetail(sha: string) {
    if (!this.source.commitDetail) return Promise.reject(new Error(`${this.label} has no commit history`));
    return this.source.commitDetail(sha);
  }

  links() {
    return this.source.links?.();
  }

  people() {
    return this.source.people?.() ?? Promise.resolve([]);
  }

  watch(onChange: () => void): () => void {
    return this.source.watch?.(onChange) ?? (() => {});
  }
}
