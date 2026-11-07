import { expect, test } from 'bun:test';
import { LocalServerSource } from './local-server';

test('local project roster resolves a personal-email author through the exact GitHub commit', async () => {
  const calls: string[] = [];
  const sha = '1234567890abcdef1234567890abcdef12345678';
  const server = Bun.serve({ port: 0, fetch(req) {
    const path = new URL(req.url).pathname;
    calls.push(path);
    if (path === '/api/people') return Response.json({ lines: [{ sha, name: 'Sam Taylor', email: 'sam@example.com', date: '2026-11-07' }] });
    if (path === `/api/gh/repos/team/project/commits/${sha}`) {
      expect(req.headers.get('x-bmad-board')).toBe('1');
      return Response.json({ author: { login: 'sam-taylor', avatar_url: 'https://avatars.githubusercontent.com/u/0?v=4', type: 'User' }, commit: { author: { name: 'Sam Taylor', email: 'sam@example.com' }, message: 'Work' } });
    }
    return new Response(null, { status: 404 });
  } });
  try {
    const source = new LocalServerSource({ root: '/test/project', name: 'project', git: true, branch: 'main', remote: 'git@github.com:team/project.git' }, `http://localhost:${server.port}`);
    const roster = await source.people();
    expect(roster).toHaveLength(1);
    expect(roster[0]).toMatchObject({ name: 'Sam Taylor', login: 'sam-taylor', avatarUrl: 'https://avatars.githubusercontent.com/u/0?v=4', commits: 1 });
    expect(calls).toHaveLength(2);
  } finally { server.stop(true); }
});
