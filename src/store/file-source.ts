import { parseChangedBy } from '../domain/people';
import type { Member } from '../domain';
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

/** One commit that touched ticket files: what the agents and the board did, newest first. */
export interface Activity {
  sha: string;
  date: string;
  author: string;
  subject: string;
  /** From the `Changed-by:` trailer the board writes, e.g. `person:Dipak`. */
  changedBy?: string;
  coAuthors?: string[];
  paths: string[];
  url?: string;
}

/** `Changed-by: person:Dipak via bmad-board` → `person:Dipak`. */
export function changedByOf(body: string): string | undefined {
  const parsed = parseChangedBy(/^Changed-by:[ \t]*(.+)$/im.exec(body)?.[1] ?? '');
  return parsed ? `${parsed.agent ? 'agent' : 'person'}:${parsed.name}` : undefined;
}

/** One commit in full: who, when, why, and what it changed. Paths are relative to the project root. */
export interface CommitDetail extends Activity {
  body: string;
  files: { status: string; path: string }[];
  /** Branches that contain it, when the source knows (local git). */
  branches?: string[];
}

/** Where the project lives, so file, commit and branch links can open on the host or in an editor. */
export interface RepoLinks {
  /** The repo's web page, e.g. https://github.com/owner/repo, when it has one. */
  web?: string;
  /** The branch the board reads. */
  branch?: string;
  /** The project's folder inside the repo ('' at the top). */
  dir: string;
  /** The project's folder on this computer, for editor links. */
  localRoot?: string;
}

export interface FileSource {
  readonly id: string;
  readonly label: string;
  readonly capabilities: StoreCapabilities;
  /** Entries of a directory, or null when it does not exist. */
  list(path: string): Promise<FileEntry[] | null>;
  /** File text, or null when it does not exist. */
  read(path: string): Promise<string | null>;
  /**
   * Writes the files as one unit: one commit locally, one commit on the PR branch on GitHub. With
   * `commit: false` a working-copy source writes them and leaves them uncommitted.
   */
  commit?(files: FileWrite[], message: string, author: ChangeAuthor, options?: { commit?: boolean }): Promise<ChangeResult>;
  /** Files the board wrote without committing that still differ from HEAD. */
  pending?(): Promise<string[]>;
  /** Commits the files `pending` lists, as one commit. */
  commitPending?(message: string, author: ChangeAuthor): Promise<ChangeResult>;
  watch?(onChange: () => void): () => void;
  /** Recent commits touching a path (a folder or file), newest first. */
  history?(path: string, limit?: number): Promise<Activity[]>;
  /** One commit with its changed files. */
  commitDetail?(sha: string): Promise<CommitDetail>;
  /** Where links to this project's files and commits go. */
  links?(): RepoLinks;
  /** People and agents who work on the project, from git or the host. Bounded and cached by the source. */
  people?(): Promise<Member[]>;
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

  /** Paths written without a commit, in order. */
  readonly uncommitted = new Set<string>();

  async commit(files: FileWrite[], message: string, author: ChangeAuthor, options?: { commit?: boolean }): Promise<ChangeResult> {
    for (const f of files) {
      if (f.text === null) this.files.delete(joinPath(f.path));
      else this.files.set(joinPath(f.path), f.text);
    }
    const paths = files.map((f) => f.path);
    if (options?.commit === false) {
      for (const p of paths) this.uncommitted.add(p);
      return { paths, uncommitted: true };
    }
    this.commits.push({ message, author, paths });
    return { paths, commit: `mem-${this.commits.length}` };
  }

  async pending(): Promise<string[]> {
    return [...this.uncommitted];
  }

  async commitPending(message: string, author: ChangeAuthor): Promise<ChangeResult> {
    const paths = [...this.uncommitted];
    this.uncommitted.clear();
    if (!paths.length) return { paths };
    this.commits.push({ message, author, paths });
    return { paths, commit: `mem-${this.commits.length}` };
  }
}

/** Co-authors remain separate contributors, including humans on bot-authored commits. */
export function coAuthorsOf(body: string): string[] {
  return [...new Set([...body.matchAll(/^Co-authored-by:[ \t]*(.+?)[ \t]*<[^>]+>[ \t]*$/gim)].map((m) => (m[1] ?? '').trim()).filter(Boolean))];
}
