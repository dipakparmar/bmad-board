import { afterAll, describe, expect, test } from 'bun:test';
import { FileTicketStore } from '../store';
import { clearMemoryCache } from '../cache';
import { allLeaves } from '../load-tree';
import { fixture } from '../testing/fixture';
import { GitHubSource, parseRepo } from './github';

/** A tiny fake of the GitHub git-data API, holding one repo in memory. */
function fakeGitHub(files: Map<string, string>) {
  // The fake's SHAs are counters, not content hashes, so the content-addressed cache must start empty.
  clearMemoryCache();
  const blobs = new Map<string, string>();
  const commits = new Map<string, { tree: Map<string, string>; parents: string[]; message: string }>();
  const refs = new Map<string, string>();
  const pulls: { head: string; base: string }[] = [];
  let n = 0;
  const id = () => (++n).toString(16).padStart(40, '0');
  const blobOf = (text: string) => { const sha = id(); blobs.set(sha, text); return sha; };
  const root = id();
  commits.set(root, { tree: new Map([...files].map(([p, t]) => [p, blobOf(t)])), parents: [], message: 'init' });
  refs.set('main', root);
  const trees = new Map<string, Map<string, string>>();

  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      const p = url.pathname.replace('/repos/o/r', '');
      const body = req.method === 'GET' ? null : await req.json() as Record<string, unknown>;
      if (p === '') return Response.json({ default_branch: 'main' });
      let m = /^\/git\/trees\/(.+)$/.exec(p);
      if (m && req.method === 'GET') {
        const ref = decodeURIComponent(m[1] ?? '');
        const tree = commits.get(refs.get(ref) ?? ref)?.tree ?? new Map();
        const dirs = new Set<string>();
        for (const path of tree.keys()) { const parts = path.split('/'); for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/')); }
        return Response.json({ truncated: false, tree: [...[...dirs].map((d) => ({ path: d, type: 'tree', sha: 'd' })), ...[...tree].map(([path, sha]) => ({ path, type: 'blob', sha }))] });
      }
      m = /^\/git\/blobs\/(.+)$/.exec(p);
      if (m) return Response.json({ encoding: 'base64', content: Buffer.from(blobs.get(m[1] ?? '') ?? '').toString('base64') });
      m = /^\/git\/ref\/heads\/(.+)$/.exec(p);
      if (m) return Response.json({ object: { sha: refs.get(decodeURIComponent(m[1] ?? '')) } });
      if (p === '/git/refs' && body) { refs.set(String(body.ref).replace('refs/heads/', ''), String(body.sha)); return Response.json({}, { status: 201 }); }
      m = /^\/git\/refs\/heads\/(.+)$/.exec(p);
      if (m && body) { refs.set(decodeURIComponent(m[1] ?? ''), String(body.sha)); return Response.json({}); }
      m = /^\/git\/commits\/(.+)$/.exec(p);
      if (m) { const sha = m[1] ?? ''; trees.set(sha, commits.get(sha)?.tree ?? new Map()); return Response.json({ tree: { sha } }); }
      if (p === '/git/trees' && body) {
        const tree = new Map(trees.get(String(body.base_tree)) ?? []);
        for (const e of body.tree as { path: string; content?: string; sha?: null }[]) {
          if (e.sha === null) tree.delete(e.path); else tree.set(e.path, blobOf(e.content ?? ''));
        }
        const sha = id(); trees.set(sha, tree); return Response.json({ sha });
      }
      if (p === '/git/commits' && body) {
        const sha = id(); commits.set(sha, { tree: trees.get(String(body.tree)) ?? new Map(), parents: body.parents as string[], message: String(body.message) });
        return Response.json({ sha });
      }
      if (p === '/pulls' && body) { pulls.push({ head: String(body.head), base: String(body.base) }); return Response.json({ html_url: 'https://github.com/o/r/pull/7' }); }
      return Response.json({ message: `unhandled ${req.method} ${p}` }, { status: 404 });
    },
  });
  return { server, refs, commits, pulls, url: `http://localhost:${server.port}` };
}

const repo = fakeGitHub(fixture('shop').files);
const mainBefore = repo.refs.get('main');
afterAll(() => repo.server.stop());

describe('GitHubSource', () => {
  test('parses repo URLs and owner/repo', () => {
    expect(parseRepo('dipakparmar/bmad-board')).toEqual({ owner: 'dipakparmar', repo: 'bmad-board', branch: undefined, dir: undefined });
    expect(parseRepo('https://github.com/acme/shop/tree/dev/planning')).toEqual({ owner: 'acme', repo: 'shop', branch: 'dev', dir: 'planning' });
  });

  test('without a token it is read-only', async () => {
    const store = new FileTicketStore(new GitHubSource({ owner: 'o', repo: 'r' }, repo.url));
    expect(store.capabilities.write).toBe(false);
    expect(allLeaves(await store.load())).toHaveLength(7);
  });

  test('changes land on one session branch with one pull request', async () => {
    const store = new FileTicketStore(new GitHubSource({ owner: 'o', repo: 'r', token: 't' }, repo.url));
    await store.load();
    const first = await store.apply([{ kind: 'mark', key: 'epic-pricing-rules/2', status: 'in-review' }], { kind: 'person', name: 'Dipak' });
    const tree = await store.load();
    expect(allLeaves(tree).find((l) => l.key === 'epic-pricing-rules/2')?.state).toBe('review');
    const second = await store.apply([{ kind: 'mark', key: 'epic-pricing-rules/3', status: 'in-progress' }], { kind: 'person', name: 'Dipak' });
    expect(first.pullRequestUrl).toBe('https://github.com/o/r/pull/7');
    expect(second.pullRequestUrl).toBe(first.pullRequestUrl);
    expect(repo.pulls).toHaveLength(1);
    expect(repo.pulls[0]?.base).toBe('main');
    const head = repo.commits.get(repo.refs.get(repo.pulls[0]?.head ?? '') ?? '');
    expect(head?.message.startsWith('chore(tickets): mark epic-pricing-rules/3 in-progress')).toBe(true);
    expect(repo.refs.get('main')).toBe(mainBefore);
  });
});
