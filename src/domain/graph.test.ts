import { describe, expect, test } from 'bun:test';
import { dependencyGraph, downstreamOf, upstreamOf } from './graph';
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
