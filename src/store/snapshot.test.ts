import { beforeEach, describe, expect, test } from 'bun:test';
import { clearMemoryCache } from './cache';
import type { FileEntry, FileSource } from './file-source';
import { loadWithSnapshot, readThroughCache, snapshotFromFiles, underPrefixes, type Snapshot } from './snapshot';

/** A source over a map of files whose snapshot versions are the file text itself, counting reads. */
function source(files: Map<string, string>, prefixes = ['_bmad-output']) {
  const reads: string[] = [];
  const snap = (): Snapshot => snapshotFromFiles('t', [...files].map(([p, t]) => [p, `v:${t}`]), underPrefixes(prefixes));
  const src: FileSource & { snapshot(): Promise<Snapshot> } = {
    id: 'mem', label: 'mem', capabilities: { write: false, commits: false, pullRequests: false, watch: false },
    snapshot: async () => snap(),
    async read(path) { reads.push(path); return files.get(path) ?? null; },
    async list(path): Promise<FileEntry[] | null> { return snap().list(path) ?? null; },
  };
  return { src, reads };
}

const load = async (src: FileSource) => {
  const names = ((await src.list('_bmad-output')) ?? []).map((e) => e.name).sort();
  return Promise.all(names.map((n) => src.read(`_bmad-output/${n}`)));
};

describe('snapshot cache', () => {
  beforeEach(() => clearMemoryCache());

  test('reuses a tree when nothing it read changed, and reloads when one file does', async () => {
    const files = new Map([['_bmad-output/a.md', 'A'], ['_bmad-output/b.md', 'B'], ['src/app.ts', 'x']]);
    const { src, reads } = source(files);
    expect((await loadWithSnapshot(src, 'k', load)).reused).toBe(false);
    files.set('src/app.ts', 'y'); // code-only change
    expect(await loadWithSnapshot(src, 'k', load)).toEqual({ value: ['A', 'B'], reused: true });
    files.set('_bmad-output/b.md', 'B2');
    expect(await loadWithSnapshot(src, 'k', load)).toEqual({ value: ['A', 'B2'], reused: false });
    files.set('_bmad-output/c.md', 'C'); // a new file changes the folder listing
    expect((await loadWithSnapshot(src, 'k', load)).value).toEqual(['A', 'B2', 'C']);
    expect(reads.length).toBe(7);
  });

  test('does not cache a tree that read outside the snapshot', async () => {
    const { src } = source(new Map([['_bmad-output/a.md', 'A'], ['other/x.md', 'X']]));
    const outside = async (s: FileSource) => [await s.read('_bmad-output/a.md'), await s.read('other/x.md')];
    await loadWithSnapshot(src, 'k2', outside);
    expect((await loadWithSnapshot(src, 'k2', outside)).reused).toBe(false);
  });

  test('scoped snapshots know nothing outside their folders', () => {
    const snap = snapshotFromFiles('t', [['_bmad/config.toml', 's1']], underPrefixes(['_bmad']));
    expect(snap.fileVersion('_bmad/config.toml')).toBe('s1');
    expect(snap.fileVersion('_bmad/missing.toml')).toBeNull();
    expect(snap.fileVersion('README.md')).toBeUndefined();
    expect(snap.list('')).toBeUndefined();
    expect(snap.list('_bmad')).toEqual([{ name: 'config.toml', kind: 'file' }]);
  });

  test('reads file text once per blob', async () => {
    const snap = snapshotFromFiles('t', [['a.md', 'sha1'], ['copy/a.md', 'sha1']]);
    let fetches = 0;
    const get = async () => { fetches++; return 'text'; };
    expect(await readThroughCache(snap, 'a.md', get)).toBe('text');
    expect(await readThroughCache(snap, 'copy/a.md', get)).toBe('text');
    expect(await readThroughCache(snap, 'gone.md', get)).toBeNull();
    expect(fetches).toBe(1);
  });
});
