import { describe, expect, test } from 'bun:test';
import { membersFromAssignees, membersFromGitLog, mergeMembers, parseChangedBy } from './people';

describe('people', () => {
  test('reads Changed-by trailers', () => {
    expect(parseChangedBy('person:Dipak via bmad-board')).toEqual({ name: 'Dipak', agent: false });
    expect(parseChangedBy('agent:dev-agent')).toEqual({ name: 'dev-agent', agent: true });
    expect(parseChangedBy('nonsense')).toBeNull();
  });

  test('credits the board user, not the committer, and counts commits', () => {
    const m = membersFromGitLog([
      { name: 'CI', email: 'ci@x', date: '2026-11-05', changedBy: 'person:Dipak via bmad-board' },
      { name: 'Dipak Parmar', email: 'd@x', date: '2026-11-04' },
      { name: 'Dipak Parmar', email: 'd@x', date: '2026-11-06' },
      { name: 'claude[bot]', email: 'bot@x', date: '2026-11-01' },
    ]);
    expect(m.map((x) => [x.name, x.commits, x.agent, x.lastActive])).toEqual([
      ['Dipak', 1, false, '2026-11-05'],
      ['Dipak Parmar', 2, false, '2026-11-06'],
      ['claude[bot]', 1, true, '2026-11-01'],
    ]);
  });

  test('merges git, GitHub and assignees by name, email or login', () => {
    const merged = mergeMembers(
      membersFromGitLog([{ name: 'dipakparmar', email: 'd@x', date: '2026-11-06' }]),
      [{ name: 'dipakparmar', login: 'dipakparmar', avatarUrl: 'https://a', agent: false, commits: 40, sources: ['github'] }],
      membersFromAssignees(['DipakParmar', 'dev-agent', undefined, 'dev-agent']),
    );
    expect(merged.map((m) => m.name)).toEqual(['dipakparmar', 'dev-agent']);
    expect(merged[0]).toMatchObject({ login: 'dipakparmar', avatarUrl: 'https://a', commits: 40, sources: ['git', 'github', 'tickets'] });
    expect(merged[1]?.agent).toBe(true);
  });
});
