import { describe, expect, test } from 'bun:test';
import { whatsNext } from '../domain';
import { allLeaves, doneContainers, loadTicketTree } from './load-tree';
import { fixture } from './testing/fixture';

describe('loadTicketTree on the ticket-tree layout', () => {
  test('reads config, initiatives, epics in build order, and the backlog', async () => {
    const tree = await loadTicketTree(fixture('shop'));
    expect(tree.layout).toBe('ticket-tree');
    expect(tree.outputFolder).toBe('_bmad-output');
    expect(tree.activeInitiative).toBe('initiative-checkout');
    expect(tree.problems).toEqual([]);
    const [checkout] = tree.initiatives;
    expect(checkout?.title).toBe('Shoppers check out online');
    expect(checkout?.epics.map((e) => e.slug)).toEqual(['epic-pricing-rules', 'epic-cart-rules']);
    expect(checkout?.companions).toEqual(['_bmad-output/initiative-checkout/prd-checkout']);
    expect(tree.backlog.map((l) => l.title)).toEqual(['Checkout total ignores discount codes']);
  });

  test('joins entries, leaf files and plans, and derives board state', async () => {
    const tree = await loadTicketTree(fixture('shop'));
    const byKey = new Map(allLeaves(tree).map((l) => [l.key, l]));
    expect(byKey.get('epic-pricing-rules/1')).toMatchObject({ status: 'done', state: 'done' });
    const two = byKey.get('epic-pricing-rules/2');
    expect(two).toMatchObject({ status: 'in-progress', state: 'in-progress', after: ['epic-pricing-rules/1'] });
    expect(two?.plan?.assignee).toBe('dev-agent');
    expect(two?.file?.refined).toBe(true);
    expect(byKey.get('epic-pricing-rules/3')).toMatchObject({ status: '', state: 'backlog', type: 'spike', hitl: true });
  });

  test('resolves cross-epic refs and epic gates', async () => {
    const tree = await loadTicketTree(fixture('shop'));
    const byKey = new Map(allLeaves(tree).map((l) => [l.key, l]));
    expect(byKey.get('epic-cart-rules/2')?.after).toEqual(['epic-cart-rules/1', 'epic-pricing-rules/2']);
    expect(byKey.get('epic-cart-rules/1')?.gatedBy).toEqual(['epic-pricing-rules']);
    expect(tree.initiatives[0]?.epics[1]?.refined).toBe(false);
  });

  test('what is next matches the agents\' view', async () => {
    const tree = await loadTicketTree(fixture('shop'));
    const next = whatsNext(allLeaves(tree), doneContainers(tree));
    expect(next.inProgress.map((l) => l.key)).toEqual(['epic-pricing-rules/2']);
    expect(next.blocked.map((b) => [b.leaf.key, b.waitingOn])).toEqual([
      ['epic-pricing-rules/3', []],
      ['epic-pricing-rules/4', ['epic-pricing-rules/2', 'epic-pricing-rules/3']],
      ['epic-cart-rules/1', ['epic-pricing-rules']],
      ['epic-cart-rules/2', ['epic-cart-rules/1', 'epic-pricing-rules/2', 'epic-pricing-rules']],
    ]);
    expect(next.readyToRefine.map((l) => l.key)).toEqual(['backlog/bug-checkout-total-ignores-discount-codes.md']);
  });
});

describe('loadTicketTree on the v6 layout', () => {
  test('reads sprint-status.yaml, the epics file and story files, read-only', async () => {
    const tree = await loadTicketTree(fixture('legacy-v6'));
    expect(tree.layout).toBe('v6');
    const [sprint] = tree.initiatives;
    expect(sprint?.title).toBe('Legacy shop');
    expect(sprint?.epics.map((e) => [e.title, e.status, e.retrospective?.status, e.description])).toEqual([
      ['Accounts', 'in-progress', 'optional', 'People can sign up, sign in and recover their account.'],
      ['Orders', undefined, 'optional', 'People can see what they ordered.'],
    ]);
    expect(sprint?.epics[0]?.leaves.map((l) => [l.key, l.title, l.status, l.state, l.after])).toEqual([
      ['epic-1/1', 'User signup', 'done', 'done', []],
      ['epic-1/2', 'Password reset by email', 'in-review', 'review', ['epic-1/1']],
      ['epic-1/3', 'Profile page', 'ready-for-dev', 'backlog', ['epic-1/2']],
      // Planned in epics.md, not yet in sprint planning.
      ['epic-1/4', 'Delete account', '', 'backlog', ['epic-1/3']],
    ]);
    const reset = sprint?.epics[0]?.leaves[1];
    expect(reset?.entry?.description).toContain('reset my password by email');
    expect(reset?.entry?.verify).toContain('expires after an hour');
    expect(reset?.plan?.body).toContain('[AI-Review]');
    expect(reset?.docs?.map((d) => [d.candidates[0], d.anchor])).toContainEqual(['_bmad-output/planning-artifacts/architecture.md', 'Auth']);
    expect(sprint?.epics[0]?.docs?.map((d) => d.kind)).toEqual(['epics', 'retro']);
    expect(sprint?.docs?.map((d) => d.kind)).toEqual(['sprint', 'epics', 'architecture', 'prd']);
    expect(tree.sprint).toMatchObject({ projectKey: 'SHOP', lastUpdated: '11-05-2026 17:20', trackingSystem: 'file-system', actionItems: [{ epic: 1, action: 'Add an expiry test to every token flow', owner: 'Priya', status: 'open' }] });
    expect(tree.problems).toEqual([]);
  });
});
