/**
 * Git-aware loading. A source that can describe its files cheaply (one request: the git tree on
 * GitHub, `git ls-files` through the local server) hands back a Snapshot: every file's blob SHA and
 * every folder's listing. Then:
 *
 * - file text is cached by blob SHA, so only files whose content changed are fetched again;
 * - a parsed tree is cached with the versions of exactly the files and folders it read, so when a
 *   commit touches none of them (code-only commits, say) the tree is reused without reading anything.
 *
 * Like `git diff --name-only` between the cached commit and HEAD, but per file read, so it also covers
 * uncommitted edits and folders the loader listed.
 */
import { cacheGet, cacheSet, hashString } from './cache';
import type { FileEntry, FileSource } from './file-source';
import { joinPath } from './file-source';

export interface Snapshot {
  /** What it was taken at: a commit SHA, or a worktree fingerprint. For display and debugging. */
  at: string;
  /** Content version of a file (git blob SHA), or null when there is no such file. */
  fileVersion(path: string): string | null | undefined;
  /** Children of a folder, or null when there is no such folder; undefined when the snapshot doesn't cover it. */
  list(path: string): FileEntry[] | null | undefined;
}

/** Builds a snapshot from a flat file list (`path → blob SHA`), deriving folders from the paths. */
export function snapshotFromFiles(at: string, files: Iterable<[string, string]>, covers: (path: string) => boolean = () => true): Snapshot {
  const versions = new Map<string, string>();
  const dirs = new Map<string, Map<string, FileEntry['kind']>>([['', new Map()]]);
  for (const [raw, sha] of files) {
    const path = joinPath(raw);
    versions.set(path, sha);
    const parts = path.split('/');
    for (let i = 0; i < parts.length; i++) {
      const parent = parts.slice(0, i).join('/');
      const name = parts[i] ?? '';
      if (!dirs.has(parent)) dirs.set(parent, new Map());
      dirs.get(parent)?.set(name, i === parts.length - 1 ? 'file' : 'dir');
    }
  }
  return {
    at,
    fileVersion: (p) => {
      const path = joinPath(p);
      if (!covers(path)) return undefined;
      return versions.get(path) ?? null;
    },
    list: (p) => {
      const path = joinPath(p);
      if (!covers(path)) return undefined;
      const d = dirs.get(path);
      if (d) return [...d].map(([name, kind]) => ({ name, kind }));
      return covers(path) ? null : undefined;
    },
  };
}

/** A `covers` test for snapshots scoped to some top-level folders (and everything under them). */
export function underPrefixes(prefixes: string[]): (path: string) => boolean {
  const clean = prefixes.map((p) => joinPath(p)).filter(Boolean);
  return (path) => clean.some((p) => path === p || path.startsWith(`${p}/`));
}

/** A FileSource that also knows its snapshot. */
export interface SnapshotSource extends FileSource {
  snapshot(): Promise<Snapshot | null>;
}

export function hasSnapshot(src: FileSource): src is SnapshotSource {
  return typeof (src as Partial<SnapshotSource>).snapshot === 'function';
}

const listingVersion = (entries: FileEntry[] | null | undefined) =>
  entries === undefined ? undefined : entries === null ? 'none' : hashString(entries.map((e) => `${e.kind}:${e.name}`).sort().join('\n'));

interface CachedTree<T> {
  files: Record<string, string | null>;
  dirs: Record<string, string>;
  value: T;
}

/**
 * Runs `load` against a recording view of `src`, caching the result with what it read. Next time, if
 * every recorded file and folder is unchanged in the new snapshot, the cached result comes back with
 * no reads at all.
 */
export async function loadWithSnapshot<T>(src: FileSource, cacheKey: string, load: (src: FileSource) => Promise<T>): Promise<{ value: T; reused: boolean }> {
  const snap = hasSnapshot(src) ? await src.snapshot().catch(() => null) : null;
  if (!snap) return { value: await load(src), reused: false };

  const cached = await cacheGet<CachedTree<T>>(cacheKey);
  if (cached) {
    const filesSame = Object.entries(cached.files).every(([p, v]) => snap.fileVersion(p) === v);
    const dirsSame = filesSame && Object.entries(cached.dirs).every(([p, v]) => listingVersion(snap.list(p)) === v);
    if (filesSame && dirsSame) return { value: cached.value, reused: true };
  }

  const files: Record<string, string | null> = {};
  const dirs: Record<string, string> = {};
  let coverable = true;
  // A plain wrapper (not a prototype trick), so the source's own state is never written to the wrapper.
  const recording: FileSource = {
    id: src.id,
    label: src.label,
    capabilities: src.capabilities,
    async read(path: string) {
      const v = snap.fileVersion(path);
      if (v === undefined) coverable = false;
      else files[joinPath(path)] = v;
      return src.read(path);
    },
    async list(path: string) {
      const entries = await src.list(path);
      const v = listingVersion(snap.list(path));
      if (v === undefined) coverable = false;
      else dirs[joinPath(path)] = v;
      return entries;
    },
  };
  const value = await load(recording);
  // Only cache what the snapshot can vouch for next time.
  if (coverable) void cacheSet(cacheKey, { files, dirs, value } satisfies CachedTree<T>);
  return { value, reused: false };
}

/** Reads a file through the blob cache: by SHA when the snapshot knows it, else straight from the source. */
export async function readThroughCache(snap: Snapshot | null, path: string, fetchText: () => Promise<string | null>): Promise<string | null> {
  const v = snap?.fileVersion(path);
  if (v === null) return null;
  if (!v) return fetchText();
  const key = `blob:${v}`;
  const hit = await cacheGet<string>(key);
  if (hit !== undefined) return hit;
  const text = await fetchText();
  if (text !== null) void cacheSet(key, text);
  return text;
}
