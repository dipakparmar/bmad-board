import { describe, expect, test } from 'bun:test';
import { whatsNext } from './next';
import { boardState } from './status';
import type { Leaf } from './ticket-tree';

function leaf(key: string, over: Partial<Leaf> = {}): Leaf {
  const status = over.status ?? '';
  return {
    key, id: key.split('/')[1] ?? key, type: 'story', title: key, folder: key.split('/')[0] ?? '',
    after: [], gatedBy: [], hitl: false, status, state: boardState(status), ...over,
  };
}

describe('whatsNext', () => {
  test('an entry with no plan and no prerequisites is ready to start', () => {
    expect(whatsNext([leaf('epic-a/1')]).readyToStart.map((l) => l.key)).toEqual(['epic-a/1']);
  });

  test('a prerequisite in review counts as met', () => {
    const view = whatsNext([leaf('epic-a/1', { status: 'built', state: 'review' }), leaf('epic-a/2', { after: ['epic-a/1'] })]);
    expect(view.readyToStart.map((l) => l.key)).toEqual(['epic-a/2']);
    expect(view.inProgress.map((l) => l.key)).toEqual(['epic-a/1']);
  });

  test('an epic gate waits for the epic to be done, not in review', () => {
    const gated = leaf('epic-b/1', { gatedBy: ['epic-a'] });
    expect(whatsNext([gated]).blocked[0]?.waitingOn).toEqual(['epic-a']);
    expect(whatsNext([gated], ['epic-a']).readyToStart).toHaveLength(1);
  });

  test('a blocked plan, an open unknown, and refine-first are reported apart', () => {
    const view = whatsNext([
      leaf('epic-a/1', { status: 'blocked', plan: { path: 'p', ticket: '1', status: 'blocked', blockedReason: 'needs keys', body: '' } }),
      leaf('epic-a/2', { entry: { id: 2, type: 'story', title: '', description: '', covers: [], after: [], hitl: false, unknown: 'which PSP?' } }),
      leaf('epic-a/3', { entry: { id: 3, type: 'story', title: '', description: '', covers: [], after: [], hitl: false, refine: true } }),
    ]);
    expect(view.blocked.map((b) => b.reason)).toEqual(['needs keys', 'which PSP?']);
    expect(view.readyToRefine.map((l) => l.key)).toEqual(['epic-a/3']);
  });

  test('done and dropped leaves are left out', () => {
    const view = whatsNext([leaf('epic-a/1', { status: 'done' }), leaf('epic-a/2', { status: 'dropped' })]);
    expect(Object.values(view).flat()).toHaveLength(0);
  });
});
