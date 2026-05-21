// Kahn's algorithm. Returns array of node IDs in execution order. Throws on cycle.
export function topologicalSort(nodes, edges) {
  const ids = nodes.map((n) => n.id);
  const indeg = new Map(ids.map((id) => [id, 0]));
  const adj = new Map(ids.map((id) => [id, []]));

  for (const e of edges) {
    if (!adj.has(e.source) || !indeg.has(e.target)) continue;
    adj.get(e.source).push(e.target);
    indeg.set(e.target, (indeg.get(e.target) || 0) + 1);
  }

  const queue = ids.filter((id) => indeg.get(id) === 0);
  const result = [];
  while (queue.length) {
    const id = queue.shift();
    result.push(id);
    for (const nxt of adj.get(id) || []) {
      indeg.set(nxt, indeg.get(nxt) - 1);
      if (indeg.get(nxt) === 0) queue.push(nxt);
    }
  }
  if (result.length !== ids.length) {
    throw new Error('Pipeline has a cycle');
  }
  return result;
}

export function inputsFor(nodeId, nodes, edges, results) {
  const incoming = edges.filter((e) => e.target === nodeId);
  if (!incoming.length) return [];
  // Merge rows from all upstream nodes
  let merged = [];
  for (const e of incoming) {
    const r = results[e.source]?.rows || [];
    merged = merged.concat(r);
  }
  return merged;
}
