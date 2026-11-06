import { describe, expect, test } from 'bun:test';
import { parse } from 'smol-toml';
import { allLeaves } from './load-tree';
import { parseFrontmatter } from './frontmatter';
import { FileTicketStore } from './store';
import { fixture } from './testing/fixture';

const person = { kind: 'person' as const, name: 'Dipak' };
const PRICING = '_bmad-output/initiative-checkout/tickets/epic-pricing-rules/tickets';

async function setup(name = 'shop') {
  const src = fixture(name);
  const store = new FileTicketStore(src);
  await store.load();
  return { src, store };
}

describe('FileTicketStore.apply', () => {
  test('mark creates a plan for an entry that has none, named as BMAD names it', async () => {
    const { src, store } = await setup();
    const result = await store.apply([{ kind: 'mark', key: 'epic-pricing-rules/3', status: 'in-progress', assignee: 'Dipak' }], person);
    const path = `${PRICING}/spike-pick-a-tax-provider-plan.md`;
    expect(result.paths).toEqual([path]);
    expect(parseFrontmatter((await src.read(path)) ?? '').data).toEqual({ title: 'Pick a tax provider', ticket: 3, status: 'in-progress', assignee: 'Dipak' });
    expect(src.commits[0]?.message).toBe('chore(tickets): mark epic-pricing-rules/3 in-progress\n\nChanged-by: person:Dipak via bmad-board');
  });

  test('mark edits an existing plan in place and keeps its other lines', async () => {
    const { src, store } = await setup();
    await store.apply([{ kind: 'mark', key: 'epic-pricing-rules/2', status: 'blocked', blockedReason: 'needs PSP keys' }], person);
    const text = (await src.read(`${PRICING}/story-apply-and-refuse-discount-codes-plan.md`)) ?? '';
    const { data, body } = parseFrontmatter(text);
    expect(data).toMatchObject({ status: 'blocked', assignee: 'dev-agent', baseline_revision: '8b1e004', blocked_reason: 'needs PSP keys' });
    expect(typeof data.blocked_at).toBe('string');
    expect(body).toContain('- [ ] Refusal reason in the checkout UI');
    const tree = await store.load();
    expect(allLeaves(tree).find((l) => l.key === 'epic-pricing-rules/2')?.status).toBe('blocked');
  });

  test('assign changes only the assignee and keeps a block', async () => {
    const { src, store } = await setup();
    await store.apply([{ kind: 'mark', key: 'epic-pricing-rules/2', status: 'blocked', blockedReason: 'needs PSP keys' }], person);
    await store.load();
    await store.apply([{ kind: 'assign', key: 'epic-pricing-rules/2', assignee: 'Priya' }], person);
    const { data } = parseFrontmatter((await src.read(`${PRICING}/story-apply-and-refuse-discount-codes-plan.md`)) ?? '');
    expect(data).toMatchObject({ status: 'blocked', assignee: 'Priya', blocked_reason: 'needs PSP keys' });
    expect(src.commits.at(-1)?.message).toStartWith('chore(tickets): assign epic-pricing-rules/2 to Priya');
    await store.load();
    await store.apply([{ kind: 'assign', key: 'epic-pricing-rules/2', assignee: '' }], person);
    expect(parseFrontmatter((await src.read(`${PRICING}/story-apply-and-refuse-discount-codes-plan.md`)) ?? '').data.assignee).toBeUndefined();
  });

  test('assigning an unplanned ticket does not claim a build started', async () => {
    const { src, store } = await setup();
    await store.apply([{ kind: 'assign', key: 'epic-pricing-rules/3', assignee: 'Priya' }], person);
    const { data } = parseFrontmatter((await src.read(`${PRICING}/spike-pick-a-tax-provider-plan.md`)) ?? '');
    expect(data).toEqual({ title: 'Pick a tax provider', ticket: 3, assignee: 'Priya' });
  });

  test('clear-block removes the block fields', async () => {
    const { src, store } = await setup();
    await store.apply([{ kind: 'mark', key: 'epic-pricing-rules/2', status: 'blocked', blockedReason: 'x' }], person);
    await store.load();
    await store.apply([{ kind: 'clear-block', key: 'epic-pricing-rules/2' }], person);
    const { data } = parseFrontmatter((await src.read(`${PRICING}/story-apply-and-refuse-discount-codes-plan.md`)) ?? '');
    expect(data.blocked_at).toBeUndefined();
    expect(data.status).toBe('in-progress');
  });

  test('edit-entry rewrites one table and keeps the file\'s comments', async () => {
    const { src, store } = await setup();
    await store.apply([{ kind: 'edit-entry', key: 'epic-pricing-rules/3', patch: { unknown: undefined, risk: 'high', title: 'Pick a tax provider (US only)' } }], person);
    const text = (await src.read(`${PRICING}/tickets.toml`)) ?? '';
    expect(text.startsWith('# Every planned story, in build order.')).toBe(true);
    const entry = (parse(text).entry as Record<string, unknown>[])[2];
    expect(entry).toMatchObject({ id: 3, risk: 'high', title: 'Pick a tax provider (US only)' });
    expect(entry?.unknown).toBeUndefined();
  });

  test('editing after on a leaf with a file updates both places', async () => {
    const { src, store } = await setup();
    await store.apply([{ kind: 'edit-entry', key: 'epic-pricing-rules/2', patch: { after: [1, 3] } }], person);
    const { data } = parseFrontmatter((await src.read(`${PRICING}/story-apply-and-refuse-discount-codes.md`)) ?? '');
    expect(data.after).toEqual([1, 3]);
    expect((parse((await src.read(`${PRICING}/tickets.toml`)) ?? '').entry as { after: unknown }[])[1]?.after).toEqual([1, 3]);
  });

  test('add-entry takes the next id and reorder rewrites build order', async () => {
    const { src, store } = await setup();
    await store.apply([{ kind: 'add-entry', folder: 'epic-pricing-rules', entry: { type: 'story', title: 'Show savings', description: 'Shows what the code saved.', covers: ['R2'], after: [2], hitl: false } }], person);
    await store.load();
    await store.apply([{ kind: 'reorder', folder: 'epic-pricing-rules', order: [1, 2, 5, 3, 4] }], person);
    const entries = parse((await src.read(`${PRICING}/tickets.toml`)) ?? '').entry as { id: number; title: string }[];
    expect(entries.map((e) => e.id)).toEqual([1, 2, 5, 3, 4]);
    expect(entries[2]?.title).toBe('Show savings');
  });

  test('file-bug writes a standalone ticket to backlog/', async () => {
    const { store } = await setup();
    const { paths } = await store.apply([{ kind: 'file-bug', title: 'Coupon field accepts spaces', body: 'Trailing spaces make valid codes fail.' }], person);
    expect(paths).toEqual(['_bmad-output/backlog/bug-coupon-field-accepts-spaces.md']);
    const tree = await store.load();
    expect(tree.backlog.map((l) => l.title)).toContain('Coupon field accepts spaces');
  });

  test('v6 projects are read-only', async () => {
    const { store } = await setup('legacy-v6');
    expect(store.apply([{ kind: 'mark', key: 'epic-1/3', status: 'in-progress' }], person)).rejects.toThrow('bmad migrate method');
  });
});
