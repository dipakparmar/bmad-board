/**
 * Where bytes come from. Paths are POSIX-style and relative to the project root (the folder holding `_bmad/`).
 * Each TicketStore adapter is a FileSource plus the shared tree loader and change planner.
 */
import type { ChangeAuthor, ChangeResult, StoreCapabilities } from '../domain';

export interface FileEntry {
  name: string;
  kind: 'file' | 'dir';
}

export interface FileWrite {
  path: string;
  /** null deletes the file. */
  text: string | null;
}

export interface FileSource {
  readonly id: string;
  readonly label: string;
  readonly capabilities: StoreCapabilities;
  /** Entries of a directory, or null when it does not exist. */
  list(path: string): Promise<FileEntry[] | null>;
  /** File text, or null when it does not exist. */
  read(path: string): Promise<string | null>;
  /** Writes the files as one unit: one commit locally, one commit on the PR branch on GitHub. */
  commit?(files: FileWrite[], message: string, author: ChangeAuthor): Promise<ChangeResult>;
  watch?(onChange: () => void): () => void;
}

export function joinPath(...parts: string[]): string {
  return parts
    .flatMap((p) => p.split('/'))
    .filter((p) => p && p !== '.')
    .join('/');
}

export function dirname(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
}

export function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** An in-memory source, used by tests and by the demo project. */
export class MemorySource implements FileSource {
  readonly capabilities: StoreCapabilities = { write: true, commits: true, pullRequests: false, watch: false };
  readonly files = new Map<string, string>();
  readonly commits: { message: string; author: ChangeAuthor; paths: string[] }[] = [];

  constructor(files: Record<string, string> = {}, readonly id = 'memory', readonly label = 'In memory') {
    for (const [path, text] of Object.entries(files)) this.files.set(joinPath(path), text);
  }

  async list(path: string): Promise<FileEntry[] | null> {
    const prefix = joinPath(path);
    const seen = new Map<string, FileEntry['kind']>();
    for (const file of this.files.keys()) {
      if (prefix && !file.startsWith(`${prefix}/`)) continue;
      const rest = prefix ? file.slice(prefix.length + 1) : file;
      const [head, ...tail] = rest.split('/');
      if (!head) continue;
      if (tail.length > 0) seen.set(head, 'dir');
      else if (!seen.has(head)) seen.set(head, 'file');
    }
    if (seen.size === 0 && prefix) return null;
    return [...seen].map(([name, kind]) => ({ name, kind })).sort((a, b) => a.name.localeCompare(b.name));
  }

  async read(path: string): Promise<string | null> {
    return this.files.get(joinPath(path)) ?? null;
  }

  async commit(files: FileWrite[], message: string, author: ChangeAuthor): Promise<ChangeResult> {
    for (const f of files) {
      if (f.text === null) this.files.delete(joinPath(f.path));
      else this.files.set(joinPath(f.path), f.text);
    }
    const paths = files.map((f) => f.path);
    this.commits.push({ message, author, paths });
    return { paths, commit: `mem-${this.commits.length}` };
  }
}
