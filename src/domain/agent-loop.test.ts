import { describe, expect, test } from 'bun:test';
import { handoffs, planProgress } from './agent-loop';
import type { Leaf } from './ticket-tree';

const base: Leaf = { key: 'epic-a/2', id: 2, type: 'story', title: 'x', folder: 'epic-a', dir: '', initiative: 'i', after: [], gatedBy: [], hitl: false, status: '', state: 'backlog' };

describe('agent loop', () => {
  test('plan progress counts checklist items', () => {
    expect(planProgress('- [x] a\n- [ ] b\n  * [X] c')).toEqual({ done: 2, total: 3 });
    expect(planProgress('no list')).toBeNull();
  });

  test('a ready story can be built, unattended when no person is needed', () => {
    expect(handoffs(base, '1.2', 'ready').map((h) => h.skill)).toEqual(['bmad-build', 'bmad-build-auto']);
    expect(handoffs({ ...base, hitl: true }, '1.2', 'ready').map((h) => h.skill)).toEqual(['bmad-build']);
    expect(handoffs(base, '1.2', 'ready')[0]?.prompt).toBe('Use bmad-build to build story 1.2.');
  });

  test('an open question goes to the PO agent first', () => {
    const h = handoffs({ ...base, entry: { id: 2, type: 'story', title: 'x', description: '', covers: [], after: [], hitl: false, unknown: 'Which PSP?' } }, '1.2', 'blocked');
    expect(h[0]?.skill).toBe('bmad-agent-po');
    expect(h[0]?.prompt).toContain('Which PSP?');
  });

  test('a built story goes to code review against its baseline', () => {
    const h = handoffs({ ...base, status: 'built', state: 'review', plan: { path: 'p', ticket: '2', status: 'built', baselineRevision: 'abc123', body: '' } }, '1.2', 'active');
    expect(h.map((x) => x.prompt)).toEqual(['Use bmad-code-review to review story 1.2 against abc123.']);
  });
});
