import { describe, expect, test } from 'bun:test';
import { frontmatterDependencies, proseDependencies as raw, type ProseRef } from './prose-deps';

// Order is not part of the contract.
const sorted = (refs: ProseRef[]) => [...refs].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
const proseDependencies = (body: string) => sorted(raw(body));
const set = (refs: ProseRef[]) => sorted(refs);

describe('prerequisites written in words', () => {
  test('labelled lines', () => {
    expect(proseDependencies([
      '**Prerequisites:** Story 1.1, 1.2 and Epic 3',
      'Depends on: story-cart-scaffold',
      '- Waits on epic-pricing-rules because: totals need the pricing function (see 2.4)',
      'Prerequisites: None',
      'Requires: a signed-in user and 1.5 seconds of patience',
    ].join('\n'))).toEqual(set([
      { kind: 'story', epic: '1', story: '1' }, { kind: 'story', epic: '1', story: '2' }, { kind: 'epic', id: '3' },
      { kind: 'name', name: 'story-cart-scaffold' },
      { kind: 'name', name: 'epic-pricing-rules' },
      { kind: 'story', epic: '1', story: '5' },
    ]));
  });

  test('bare numbers count only after a colon', () => {
    expect(proseDependencies('Builds on 2.1 a lot')).toEqual([]);
    expect(proseDependencies('Builds on: 2.1')).toEqual([{ kind: 'story', epic: '2', story: '1' }]);
  });

  test('a Dependencies section or a labelled list', () => {
    expect(proseDependencies('## Story\nText 4.4\n\n## Dependencies\n- 1-2-account-setup\n- #3\n\n## Dev Notes\nStory 9.9')).toEqual(set([
      { kind: 'story', epic: '1', story: '2' }, { kind: 'sibling', id: '3' },
    ]));
    expect(proseDependencies('**Dependencies:**\n- Story 2.1\n- spike-pick-a-tax-provider\n\nLater 7.7')).toEqual(set([
      { kind: 'story', epic: '2', story: '1' }, { kind: 'name', name: 'spike-pick-a-tax-provider' },
    ]));
  });

  test('skips code and comments', () => {
    expect(proseDependencies('```\nDepends on: Story 1.1\n```\n<!-- Prerequisites: 1.2 -->')).toEqual([]);
  });

  test('front matter keys from other tools', () => {
    expect(frontmatterDependencies({ depends_on: [2, '1.3'], blocked_by: 'epic-cart' })).toEqual([
      { kind: 'sibling', id: '2' }, { kind: 'story', epic: '1', story: '3' }, { kind: 'name', name: 'epic-cart' },
    ]);
  });
});
