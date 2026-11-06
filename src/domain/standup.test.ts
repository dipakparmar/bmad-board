import { describe, expect, test } from 'bun:test';
import { lastWorkingDay, standup, standupNotes, type StandupCommit } from './standup';
import type { Leaf } from './ticket-tree';
import type { LeafStatus } from './status';
import { boardState } from './status';

function ticket(id: number, status: LeafStatus | '', assignee?: string, extra: Partial<Leaf> = {}) {
  const planPath = `epic-a/story-${id}-plan.md`;
  const leaf: Leaf = {
    key: `epic-a/${id}`, id, type: 'story', title: `Story ${id}`, folder: 'epic-a', dir: '', initiative: 'i', after: [], gatedBy: [], hitl: false,
    status, state: boardState(status || 'draft'),
    plan: { path: planPath, ticket: String(id), status, assignee, body: '' },
    ...extra,
  };
  return { leaf, ref: `1.${id}`, readiness: status === '' ? 'ready' : 'active' };
}

const commit = (sha: string, actor: string, date: string, paths: string[] = []): StandupCommit => ({ sha, actor, agent: /agent/.test(actor), date, subject: `commit ${sha}`, paths });

describe('stand-up', () => {
  test('the last working day skips the weekend', () => {
    expect(lastWorkingDay(new Date(2026, 10, 9, 9)).getDay()).toBe(5); // Monday → Friday
    expect(lastWorkingDay(new Date(2026, 10, 10, 9)).getDate()).toBe(9); // Tuesday → Monday
    expect(lastWorkingDay(new Date(2026, 10, 10, 9)).getHours()).toBe(0);
  });

  test('groups tickets by who holds them, people before agents', () => {
    const tickets = [
      ticket(1, 'in-progress', 'dev-agent'),
      ticket(2, 'built', 'dev-agent'),
      ticket(3, 'blocked', 'Dipak', { plan: { path: 'p3', ticket: '3', status: 'blocked', assignee: 'Dipak', blockedAt: 'x', blockedReason: 'Which PSP?', body: '' } }),
      ticket(4, 'ready-for-dev', 'dipak'),
      ticket(5, ''),
      ticket(6, 'done', 'Dipak'),
    ];
    const s = standup(tickets, [], new Date(0));
    expect(s.members.map((m) => [m.name, m.agent])).toEqual([['Dipak', false], ['dev-agent', true]]);
    const [dipak, agent] = s.members;
    expect(dipak?.blocked.map((t) => t.ref)).toEqual(['1.3']);
    expect(dipak?.upNext.map((t) => t.ref)).toEqual(['1.4']);
    expect(agent?.doing.map((t) => t.ref)).toEqual(['1.1']);
    expect(agent?.review.map((t) => t.ref)).toEqual(['1.2']);
    expect(s.upForGrabs.map((t) => t.ref)).toEqual(['1.5']);
  });

  test('credits finished tickets to whoever committed them since the cut-off', () => {
    const tickets = [ticket(2, 'built', 'dev-agent'), ticket(6, 'done', 'Dipak'), ticket(7, 'in-progress', 'dev-agent')];
    const commits = [
      commit('a', 'dev-agent', '2026-11-05T10:00:00Z', ['epic-a/story-2-plan.md', 'epic-a/story-7-plan.md']),
      commit('b', 'Dipak', '2026-11-05T12:00:00Z', ['epic-a/story-6-plan.md']),
      commit('c', 'Dipak', '2026-11-01T12:00:00Z', ['epic-a/story-2-plan.md']),
    ];
    const s = standup(tickets, commits, new Date('2026-11-05T00:00:00Z'));
    const by = Object.fromEntries(s.members.map((m) => [m.name, m]));
    expect(by['dev-agent']?.finished.map((t) => t.ref)).toEqual(['1.2']);
    expect(by['dev-agent']?.review).toEqual([]);
    expect(by['dev-agent']?.doing.map((t) => t.ref)).toEqual(['1.7']);
    expect(by.Dipak?.finished.map((t) => t.ref)).toEqual(['1.6']);
    expect(by.Dipak?.commits.map((c) => c.sha)).toEqual(['b']);
  });

  test('notes read as a stand-up', () => {
    const s = standup([ticket(1, 'in-progress', 'Dipak')], [], new Date(2026, 10, 5));
    const notes = standupNotes(s, (t) => t.ref);
    expect(notes).toContain('### Dipak');
    expect(notes).toContain('- **Doing:** 1.1 Story 1');
  });
});
