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

// An edge from a node's 'errors' source handle carries its redirected error
// rows (Convert Types) instead of its main output.
function rowsAlong(e, results) {
  const r = results[e.source];
  if (!r) return [];
  return (e.sourceHandle === 'errors' ? r.errorRows : r.rows) || [];
}

function schemaAlong(e, results) {
  const r = results[e.source];
  if (!r) return [];
  return (e.sourceHandle === 'errors' ? r.errorSchema : r.schema) || [];
}

export function inputsFor(nodeId, nodes, edges, results) {
  const incoming = edges.filter((e) => e.target === nodeId);
  if (!incoming.length) return [];
  // Merge rows from all upstream nodes
  let merged = [];
  for (const e of incoming) {
    merged = merged.concat(rowsAlong(e, results));
  }
  return merged;
}

// Rows grouped by the target handle they arrived on, for nodes with multiple
// distinct inputs (e.g. join: 'left' vs 'right'). Edges without a
// targetHandle (single-input nodes) land under 'left'.
export function inputsByHandleFor(nodeId, edges, results) {
  const byHandle = {};
  for (const e of edges) {
    if (e.target !== nodeId) continue;
    const handle = e.targetHandle || 'left';
    byHandle[handle] = (byHandle[handle] || []).concat(rowsAlong(e, results));
  }
  return byHandle;
}

// Column-type metadata arriving at a node: the union of every upstream
// schema (first spec wins per column), mirroring inputsFor's row merge.
export function inputSchemaFor(nodeId, edges, results) {
  const byName = new Map();
  for (const e of edges) {
    if (e.target !== nodeId) continue;
    for (const spec of schemaAlong(e, results)) {
      if (!byName.has(spec.name)) byName.set(spec.name, spec);
    }
  }
  return Array.from(byName.values());
}

// Schemas grouped by target handle — the metadata twin of inputsByHandleFor.
export function schemasByHandleFor(nodeId, edges, results) {
  const byHandle = {};
  for (const e of edges) {
    if (e.target !== nodeId) continue;
    const handle = e.targetHandle || 'left';
    byHandle[handle] = (byHandle[handle] || []).concat(schemaAlong(e, results));
  }
  return byHandle;
}
