import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { allLeaves } from '../src/store/load-tree';
import { FileTicketStore } from '../src/store/store';
import { LocalServerSource, probeLocalServer } from '../src/store/sources/local-server';

const port = 33799;
const base = `http://127.0.0.1:${port}`;
let dir = '';
let proc: ReturnType<typeof Bun.spawn>;

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
  proc = Bun.spawn(['bun', join(import.meta.dir, 'index.ts'), '--root', dir, '--port', String(port)], { stdout: 'ignore', stderr: 'inherit' });
  for (let i = 0; i < 50 && !(await probeLocalServer(base)); i++) await Bun.sleep(100);
});

afterAll(() => {
  proc?.kill();
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

  test('refuses paths outside the root, .git, and writes without the header', async () => {
    expect((await fetch(`${base}/api/read?path=../../etc/passwd`)).status).toBe(400);
    expect((await fetch(`${base}/api/read?path=.git/config`)).status).toBe(400);
    const res = await fetch(`${base}/api/commit`, { method: 'POST', body: JSON.stringify({ files: [{ path: 'x.md', text: 'x' }] }) });
    expect(res.status).toBe(403);
  });
});
