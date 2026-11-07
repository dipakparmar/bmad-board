import { describe, expect, test } from 'bun:test';
import { laterStatus, leafStatusFromV6, parseEpicsDoc, parseSprintStatus, parseStoryFile, v6StoryStatus } from './sprint-v6';

describe('v6 sprint-status.yaml', () => {
  test('reads metadata, epics, split stories, retrospectives and action items', () => {
    const s = parseSprintStatus([
      '# generated: 05-06-2025 21:30', 'generated: 05-06-2025 21:30', 'last_updated: 05-07-2025 09:00', 'project: Shop', 'project_key: NOKEY',
      'tracking_system: file-system', 'story_location: "{project-root}/_bmad-output/implementation-artifacts"',
      'development_status:', '  epic-1: contexted', '  1-1-signup: done', '  1-2-reset: drafted', '  2-6a-split-story: in_progress', '  epic-1-retrospective: done', '  epic-2: backlog', '  2-1-orders: weird', '  stray: done',
      'action_items:', '  - epic: 1', '    action: "Add error-handling review"', '    owner: Charlie', '    status: open',
    ].join('\n'));
    expect([s.project, s.projectKey, s.generated, s.lastUpdated, s.trackingSystem]).toEqual(['Shop', 'NOKEY', '05-06-2025 21:30', '05-07-2025 09:00', 'file-system']);
    expect(s.epics).toEqual([{ num: 1, status: 'in-progress', retrospective: 'done' }, { num: 2, status: 'backlog' }]);
    expect(s.stories.map((x) => [x.key, x.epic, x.story, x.status])).toEqual([
      ['1-1-signup', 1, '1', 'done'], ['1-2-reset', 1, '2', 'ready-for-dev'], ['2-6a-split-story', 2, '6a', 'in-progress'], ['2-1-orders', 2, '1', 'backlog'],
    ]);
    expect(s.actionItems).toEqual([{ epic: 1, action: 'Add error-handling review', owner: 'Charlie', status: 'open' }]);
    expect(s.problems).toHaveLength(2);
  });

  test('never downgrades and maps to board statuses', () => {
    expect(laterStatus('review', 'ready-for-dev')).toBe('review');
    expect(laterStatus(null, 'in-progress')).toBe('in-progress');
    expect(v6StoryStatus('In Review')).toBe('review');
    expect(['backlog', 'ready-for-dev', 'review', 'done'].map((x) => leafStatusFromV6(x as never))).toEqual(['', 'ready-for-dev', 'in-review', 'done']);
  });
});

describe('v6 epics file', () => {
  test('reads epics, goals and stories, skipping code and trailing sections', () => {
    const doc = parseEpicsDoc([
      '# Shop - Epic Breakdown', '## Overview', 'x', '## Epic List',
      '## Epic 1: Accounts', 'People can sign up.', '### Story 1.1: Sign up', 'As a visitor…', '**Acceptance Criteria:**', '**Given** a form', '```', '## Epic 9: not real', '```',
      '### Story 1.2a: Reset', 'As a user…',
      '## Epic 2 - Orders', 'Order history.', '## Appendix', 'notes',
    ].join('\n'));
    expect(doc.epics.map((e) => [e.num, e.title, e.goal, e.stories.map((s) => `${s.story}:${s.title}`)])).toEqual([
      [1, 'Accounts', 'People can sign up.', ['1:Sign up', '2a:Reset']],
      [2, 'Orders', 'Order history.', []],
    ]);
    expect(doc.epics[0]?.stories[0]?.body).toContain('## Epic 9: not real');
  });
});

describe('v6 story file', () => {
  test('reads title, status, sections and open review follow-ups', () => {
    const f = parseStoryFile([
      '# Story 1.2: Password reset by email', '', 'Status: review', '', '## Story', 'As a user…', '## Acceptance Criteria', '1. Email sent',
      '## Tasks / Subtasks', '- [x] Task 1 (AC: #1)', '  - [x] Subtask 1.1', '- [ ] [AI-Review][High] Handle expiry [auth.ts:12]', '## Dev Notes', '[Source: docs/architecture.md#Auth]',
    ].join('\n'));
    expect([f.title, f.status, f.story, f.acceptance, f.openReviewItems]).toEqual(['Password reset by email', 'review', 'As a user…', '1. Email sent', 1]);
    expect(f.tasks).toContain('Subtask 1.1');
  });
});
