import { describe, expect, test } from 'bun:test';
import { allLeaves, loadTicketTree } from './load-tree';
import { fixture } from './testing/fixture';
import { FileTicketStore } from './store';
import { ticketsOf } from '../app/view-model';
const path = 'docs/stories/1-2-account-management.md';
const actor = { kind: 'person' as const, name: 'Tester' };

describe('owner discovery', () => {
  test('v6 reads story frontmatter owners and explicit assignees override them', async () => {
    const src = fixture('v6-template');
    const body = (await src.read(path))!;
    src.files.set(path, `---\nowner: chris\n---\n${body}`);
    expect(allLeaves(await loadTicketTree(src)).find((l) => l.key === 'epic-1/2')?.plan?.assignee).toBe('chris');
    src.files.set(path, `---\nowner: chris\n---\n${body.replace('Status: ready-for-dev', 'Status: ready-for-dev\nAssignee: Dipak')}`);
    expect(allLeaves(await loadTicketTree(src)).find((l) => l.key === 'epic-1/2')?.plan?.assignee).toBe('Dipak');
  });
  test('v6 reads Owner lines and action item owners', async () => {
    const src = fixture('v6-template');
    src.files.set(path, (await src.read(path))!.replace('Status: ready-for-dev', 'Status: ready-for-dev\nOwner: Jordan'));
    const tree = await loadTicketTree(src);
    expect(allLeaves(tree).find((l) => l.key === 'epic-1/2')?.plan?.assignee).toBe('Jordan');
    expect(tree.sprint?.actionItems.some((a) => !!a.owner)).toBe(true);
  });
  test('ticket-tree owners display without redirecting edits to the story file', async () => {
    const src = fixture('shop');
    const storyPath = '_bmad-output/initiative-checkout/tickets/epic-pricing-rules/tickets/spike-pick-a-tax-provider.md';
    src.files.set(storyPath, '---\nid: 3\ntype: spike\ntitle: Pick a tax provider\nrefined: true\n---\nTax provider research.\n');
    // Use an existing unassigned leaf and preserve its source when a plan is created.
    const tree = await loadTicketTree(src);
    const candidate = allLeaves(tree).find((l) => l.key === 'epic-pricing-rules/3')!;
    const file = candidate.file?.path ?? storyPath;
    expect(file).toBeDefined();
    const before = (await src.read(file))!;
    src.files.set(file, before.replace('---\n', '---\nowner: Priya\n'));
    const store = new FileTicketStore(src);
    const loaded = await store.load();
    expect(allLeaves(loaded).find((l) => l.key === candidate.key)?.plan).toBeUndefined();
    expect(ticketsOf('shop', 'shop', loaded, true).find((t) => t.leaf.key === candidate.key)?.leaf.plan?.assignee).toBe('Priya');
    await store.apply([{ kind: 'assign', key: candidate.key, assignee: 'Dipak' }], actor);
    expect(await src.read(file)).toBe(before.replace('---\n', '---\nowner: Priya\n'));
    expect(allLeaves(await store.load()).find((l) => l.key === candidate.key)?.plan?.assignee).toBe('Dipak');
  });
});

test('clearing an assignment does not resurrect the underlying story owner', async () => {
  const src = fixture('v6-template');
  src.files.set(path, `---\nowner: chris\n---\n${(await src.read(path))!}`);
  const store = new FileTicketStore(src);
  await store.load();
  await store.apply([{ kind: 'assign', key: 'epic-1/2', assignee: '' }], actor);
  const leaf = allLeaves(await store.load()).find((l) => l.key === 'epic-1/2');
  expect(leaf?.plan?.assignee).toBe('');
  expect(leaf?.owner).toBe('chris');
});
