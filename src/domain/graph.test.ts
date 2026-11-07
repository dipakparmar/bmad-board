import { describe, expect, test } from 'bun:test';
import { afterWith, afterWithout, cannotLink, dependencyGraph, downstreamOf, upstreamOf } from './graph';
import type { Leaf } from './ticket-tree';

const leaf = (key: string, after: string[] = [], gatedBy: string[] = []): { leaf: Leaf } => {
  const [folder = ''] = key.split('/');
  return { leaf: { key, id: Number(key.split('/')[1]), type: 'story', title: key, folder, dir: '', initiative: 'i', after, gatedBy, hitl: false, status: '', state: 'backlog' } };
};

describe('dependency graph', () => {
  test('lays prerequisites to the left and keeps chains in rows', () => {
    const g = dependencyGraph([leaf('a/1'), leaf('a/2', ['a/1']), leaf('a/3', ['a/1']), leaf('a/4', ['a/2', 'a/3']), leaf('a/5')]);
    const at = Object.fromEntries(g.nodes.map((n) => [n.key, [n.layer, n.row]]));
    expect(at).toEqual({ 'a/1': [0, 0], 'a/2': [1, 0], 'a/3': [1, 1], 'a/4': [2, 0], 'a/5': [0, 1] });
    expect(g.layers).toBe(3);
    expect(g.edges).toHaveLength(4);
  });

  test('draws an epic gate from the gating epic\'s last tickets to the gated epic\'s first', () => {
    const g = dependencyGraph([leaf('a/1'), leaf('a/2', ['a/1']), leaf('b/1', [], ['a']), leaf('b/2', ['b/1'], ['a'])]);
    expect(g.edges.filter((e) => e.kind === 'gate')).toEqual([{ from: 'a/2', to: 'b/1', kind: 'gate' }]);
    expect(g.nodes.find((n) => n.key === 'b/2')?.layer).toBe(3);
  });

  test('adds named and inferred links, with inferred order never overriding the text', () => {
    const withLinks = (l: { leaf: Leaf }, links: Leaf['links']) => ({ leaf: { ...l.leaf, links } });
    const items = [
      leaf('a/1'),
      withLinks(leaf('a/2'), { previous: 'a/1' }),
      // Its text says it needs a/2… but build order puts it first: the text wins, no loop.
      withLinks(leaf('a/3'), { noted: ['a/4'] }),
      withLinks(leaf('a/4'), { previous: 'a/3' }),
      withLinks(leaf('b/1'), { previousEpic: 'a', epicNoted: [] }),
    ];
    const g = dependencyGraph(items);
    expect(g.edges.map((e) => `${e.from}>${e.to}:${e.kind}`).sort()).toEqual(['a/1>a/2:order', 'a/4>a/3:noted'].sort());
    expect(g.cyclic).toEqual([]);
    expect(dependencyGraph(items, { order: false }).edges.map((e) => e.kind)).toEqual(['noted']);
  });

  test('survives cycles and can drop unconnected tickets', () => {
    const g = dependencyGraph([leaf('a/1', ['a/2']), leaf('a/2', ['a/1']), leaf('a/3')], { connectedOnly: true });
    expect(g.nodes.map((n) => n.key).sort()).toEqual(['a/1', 'a/2']);
    expect(g.cyclic.length).toBeGreaterThan(0);
  });

  test('walks up and down the chain', () => {
    const { edges } = dependencyGraph([leaf('a/1'), leaf('a/2', ['a/1']), leaf('a/3', ['a/2']), leaf('a/4')]);
    expect([...upstreamOf('a/3', edges)].sort()).toEqual(['a/1', 'a/2']);
    expect([...downstreamOf('a/1', edges)].sort()).toEqual(['a/2', 'a/3']);
  });
});

describe('editing dependencies', () => {
  const t = (key: string, ref: string, after: string[] = [], rawAfter: (number | string)[] = []) => {
    const { leaf: l } = leaf(key, after);
    return { leaf: { ...l, entry: { id: l.id as number, type: 'story' as const, title: key, description: '', covers: [], after: rawAfter, hitl: false } }, ref };
  };
  test('writes a sibling id inside an epic and an epic.id ref across epics', () => {
    expect(afterWith(t('a/2', '1.2', [], [5]), t('a/1', '1.1'))).toEqual([5, 1]);
    expect(afterWith(t('b/1', '2.1'), t('a/1', '1.1'))).toEqual(['1.1']);
  });
  test('removes the ref that points at the prerequisite, either spelling', () => {
    expect(afterWithout(t('a/3', '1.3', ['a/1', 'a/2'], [1, '1.2', 'epic-x']), t('a/1', '1.1'))).toEqual(['1.2', 'epic-x']);
    expect(afterWithout(t('a/3', '1.3', ['a/1', 'a/2'], [1, '1.2']), t('a/2', '1.2'))).toEqual([1]);
  });
  test('refuses loops, repeats and backlog tickets', () => {
    const a1 = t('a/1', '1.1');
    const a2 = t('a/2', '1.2', ['a/1'], [1]);
    const { edges } = dependencyGraph([a1, a2]);
    expect(cannotLink(a1, a2, edges)).toContain('loop');
    expect(cannotLink(a2, a1, edges)).toContain('already waits');
    expect(cannotLink(t('backlog/x.md', 'x'), a1, edges)).toContain('backlog');
    expect(cannotLink(t('a/3', '1.3'), a1, edges)).toBeNull();
  });
});

describe('big graphs', () => {
  test('rolls ticket links up to epics, and finds a ticket\'s neighbourhood', async () => {
    const { epicGraph, neighbourhood } = await import('./graph');
    const items = [leaf('a/1'), leaf('a/2', ['a/1']), leaf('b/1', ['a/2']), leaf('b/2', ['a/1', 'b/1']), leaf('c/1', ['b/2'])];
    const g = dependencyGraph(items);
    const eg = epicGraph(items, g.edges);
    expect(eg.nodes.map((n) => [n.folder, n.items.length])).toEqual([['a', 2], ['b', 2], ['c', 1]]);
    expect(eg.edges).toEqual([{ from: 'a', to: 'b', count: 2, kinds: ['after'] }, { from: 'b', to: 'c', count: 1, kinds: ['after'] }]);
    expect([...neighbourhood('b/1', g.edges, 1)].sort()).toEqual(['a/2', 'b/1', 'b/2']);
    expect(neighbourhood('b/1', g.edges, 9).size).toBe(5);
  });
});
