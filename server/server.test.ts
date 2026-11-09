import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { allLeaves } from '../src/store/load-tree';
import { FileTicketStore } from '../src/store/store';
import { ghCliStatus, LocalServerSource, probeLocalServer } from '../src/store/sources/local-server';

const port = 33799;
const base = `http://127.0.0.1:${port}`;
let dir = '';
let proc: ReturnType<typeof Bun.spawn>;
// Stands in for api.github.com: answers only when the gh token is forwarded.
const fakeGitHub = Bun.serve({
  port: 0,
  fetch(req) {
    if (req.headers.get('authorization') !== 'Bearer gh-test-token') return new Response('{}', { status: 401 });
    const url = new URL(req.url);
    if (url.pathname === '/user') return Response.json({ login: 'octo' });
    return Response.json({ path: url.pathname, search: url.search, method: req.method });
  },
});

function sh(...cmd: string[]) {
  const r = Bun.spawnSync(cmd, { cwd: dir });
  return r.stdout.toString().trim();
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'bmad-board-'));
  cpSync(join(import.meta.dir, '..', 'examples', 'shop'), dir, { recursive: true });
  sh('git', 'init', '-q', '-b', 'main');
  sh('git', '-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '-A');
  sh('git', '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init');
  sh('git', 'config', 'user.name', 'Board Test');
  sh('git', 'config', 'user.email', 'board@test');
  proc = Bun.spawn(['bun', join(import.meta.dir, 'index.ts'), '--root', dir, '--port', String(port)], {
    stdout: 'ignore', stderr: 'inherit',
    env: { ...process.env, GH_TOKEN: 'gh-test-token', BMAD_BOARD_GITHUB_API: `http://127.0.0.1:${fakeGitHub.port}` },
  });
  for (let i = 0; i < 50 && !(await probeLocalServer(base)); i++) await Bun.sleep(100);
});

afterAll(() => {
  proc?.kill();
  fakeGitHub.stop(true);
  rmSync(dir, { recursive: true, force: true });
});

describe('local server', () => {
  test('reports the project and its branch', async () => {
    expect(await probeLocalServer(base)).toMatchObject({ git: true, branch: 'main' });
  });

  test('a board change becomes one commit on the current branch', async () => {
    const info = await probeLocalServer(base);
    const store = new FileTicketStore(new LocalServerSource(info!, base));
    const tree = await store.load();
    expect(allLeaves(tree)).toHaveLength(7);
    const result = await store.apply([{ kind: 'mark', key: 'epic-pricing-rules/2', status: 'in-review' }], { kind: 'person', name: 'Dipak' });
    expect(result.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(sh('git', 'log', '-1', '--format=%s')).toBe('chore(tickets): mark epic-pricing-rules/2 in-review');
    expect(sh('git', 'status', '--porcelain')).toBe('');
    const after = await store.load();
    expect(allLeaves(after).find((l) => l.key === 'epic-pricing-rules/2')?.state).toBe('review');
  });

  test('history lists ticket commits with who made them', async () => {
    const info = await probeLocalServer(base);
    const log = await new LocalServerSource(info!, base).history('_bmad-output', 5);
    expect(log[0]).toMatchObject({ subject: 'chore(tickets): mark epic-pricing-rules/2 in-review', changedBy: 'person:Dipak' });
    expect(log[0]?.paths[0]).toEndWith('story-apply-and-refuse-discount-codes-plan.md');
    expect(log.at(-1)?.subject).toBe('init');
  });

  test('people come from git, crediting board changes to who made them', async () => {
    const info = await probeLocalServer(base);
    expect(info?.user).toBe('Board Test');
    const people = await new LocalServerSource(info!, base).people();
    expect(people.map((p) => [p.name, p.commits])).toEqual([['Dipak', 1], ['t', 1]]);
  });

  test('discovers human co-authors on bot commits and keeps full board actor names', async () => {
    writeFileSync(join(dir, 'coauthor.md'), 'Human and bot contribution\n');
    sh('git', 'add', 'coauthor.md');
    sh('git', '-c', 'user.name=demo-agent[bot]', '-c', 'user.email=bot@test', 'commit', '--allow-empty', '-qm', 'bot work\n\nCo-authored-by: Human Contributor <human@test>');
    const info = await probeLocalServer(base);
    const source = new LocalServerSource(info!, base);
    expect(await source.people()).toContainEqual(expect.objectContaining({ name: 'Human Contributor', email: 'human@test', agent: false, commits: 1 }));
    expect((await source.history('.', 1))[0]?.coAuthors).toEqual(['Human Contributor']);
    writeFileSync(join(dir, 'coauthor.md'), 'Board follow-up\n');
    sh('git', 'add', 'coauthor.md');
    sh('git', 'commit', '--allow-empty', '-qm', 'board work\n\nChanged-by: person:Human Contributor via bmad-board');
    expect((await source.history('.', 1))[0]?.changedBy).toBe('person:Human Contributor');
  });

  test('people lines carry SHAs only for commits a remote has', async () => {
    const remote = mkdtempSync(join(tmpdir(), 'bmad-board-remote-'));
    Bun.spawnSync(['git', 'init', '-q', '--bare', remote]);
    sh('git', 'remote', 'add', 'origin', remote);
    sh('git', 'push', '-q', 'origin', 'main');
    sh('git', 'commit', '--allow-empty', '-qm', 'local only');
    const { lines } = (await (await fetch(`${base}/api/people`)).json()) as { lines: { sha: string }[] };
    expect(lines[0]?.sha).toBe('');
    expect(lines[1]?.sha).toBe(sh('git', 'rev-parse', 'HEAD~1'));
    sh('git', 'remote', 'remove', 'origin');
    rmSync(remote, { recursive: true, force: true });
  });

  test('lends the gh CLI login to GitHub calls without exposing the token', async () => {
    expect(await ghCliStatus(base)).toEqual({ available: true, login: 'octo' });
    const res = await fetch(`${base}/api/gh/repos/o/r/contributors?per_page=100`, { headers: { 'x-bmad-board': '1' } });
    expect(await res.json()).toEqual({ path: '/repos/o/r/contributors', search: '?per_page=100', method: 'GET' });
    expect((await fetch(`${base}/api/gh/user`)).status).toBe(403);
    expect(JSON.stringify(await (await fetch(`${base}/api/info`)).json())).not.toContain('gh-test-token');
  });

  test('refuses paths outside the root, .git, and writes without the header', async () => {
    expect((await fetch(`${base}/api/read?path=../../etc/passwd`)).status).toBe(400);
    expect((await fetch(`${base}/api/read?path=.git/config`)).status).toBe(400);
    const res = await fetch(`${base}/api/commit`, { method: 'POST', body: JSON.stringify({ files: [{ path: 'x.md', text: 'x' }] }) });
    expect(res.status).toBe(403);
  });
});
