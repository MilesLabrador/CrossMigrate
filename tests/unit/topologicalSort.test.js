import { describe, it, expect } from 'vitest';
import { topologicalSort, inputsFor } from '../../server/engine/topologicalSort.js';

// Small helpers keep the test bodies about behavior, not fixture plumbing.
const node = (id) => ({ id });
const edge = (source, target) => ({ source, target });

describe('topologicalSort', () => {
  it('orders a linear pipeline source → transform → output', () => {
    const nodes = [node('out'), node('src'), node('mid')];
    const edges = [edge('src', 'mid'), edge('mid', 'out')];
    expect(topologicalSort(nodes, edges)).toEqual(['src', 'mid', 'out']);
  });

  it('runs every upstream node before a node with two inputs', () => {
    const nodes = [node('a'), node('b'), node('join')];
    const edges = [edge('a', 'join'), edge('b', 'join')];
    const order = topologicalSort(nodes, edges);
    expect(order.indexOf('join')).toBeGreaterThan(order.indexOf('a'));
    expect(order.indexOf('join')).toBeGreaterThan(order.indexOf('b'));
  });

  it('throws on a cycle instead of looping forever', () => {
    const nodes = [node('a'), node('b')];
    const edges = [edge('a', 'b'), edge('b', 'a')];
    expect(() => topologicalSort(nodes, edges)).toThrow(/cycle/i);
  });

  it('ignores edges that reference nodes not in the pipeline', () => {
    const nodes = [node('a')];
    const edges = [edge('ghost', 'a'), edge('a', 'ghost')];
    expect(topologicalSort(nodes, edges)).toEqual(['a']);
  });
});

describe('inputsFor', () => {
  it('merges rows from all upstream nodes', () => {
    const nodes = [node('a'), node('b'), node('merge')];
    const edges = [edge('a', 'merge'), edge('b', 'merge')];
    const results = {
      a: { rows: [{ n: 1 }] },
      b: { rows: [{ n: 2 }, { n: 3 }] },
    };
    expect(inputsFor('merge', nodes, edges, results)).toEqual([
      { n: 1 },
      { n: 2 },
      { n: 3 },
    ]);
  });

  it('returns an empty array for source nodes with no incoming edges', () => {
    expect(inputsFor('src', [node('src')], [], {})).toEqual([]);
  });
});
