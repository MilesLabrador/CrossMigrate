import express from 'express';
import {
  topologicalSort,
  inputsFor,
  inputsByHandleFor,
  inputSchemaFor,
  schemasByHandleFor,
} from '../engine/topologicalSort.js';
import { executeNode } from '../engine/executeNode.js';

const router = express.Router();

const DEFAULT_SAMPLE = 100;

// Metadata-only dry run. Executes the whole graph in dependency order, but
// over a small sample of each source's rows (capped at `sampleSize`, default
// 100), purely to discover which columns and types exist at every node's
// output. The point is configuration: users can set up downstream nodes
// (mappings, filters, joins) against real column names and inferred types
// before ever committing to a full run.
// Nothing here writes anywhere: destination nodes are pass-through in the
// engine, and sources are capped to `sampleSize` rows.
router.post('/collect-metadata', (req, res) => {
  const { nodes = [], edges = [], sampleSize } = req.body || {};
  const cap = Math.min(Math.max(parseInt(sampleSize) || DEFAULT_SAMPLE, 1), 1000);

  let order;
  try {
    order = topologicalSort(nodes, edges);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const slim = nodes.map((n) =>
    n.data?.rows?.length > cap
      ? { ...n, data: { ...n.data, rows: n.data.rows.slice(0, cap) } }
      : n
  );
  const byId = Object.fromEntries(slim.map((n) => [n.id, n]));

  const results = {};
  const out = {};
  for (const id of order) {
    const node = byId[id];
    try {
      const r = executeNode(
        node,
        inputsFor(id, slim, edges, results),
        inputsByHandleFor(id, edges, results),
        inputSchemaFor(id, edges, results),
        schemasByHandleFor(id, edges, results)
      );
      results[id] = r;
      out[id] = {
        columns: r.rows[0] ? Object.keys(r.rows[0]) : (r.schema || []).map((s) => s.name),
        schema: r.schema || [],
        sample: r.rows.slice(0, 3),
        sampledRows: r.rows.length,
      };
    } catch (err) {
      // A broken node shouldn't hide metadata for the rest of the graph.
      results[id] = { rows: [], meta: {}, schema: [] };
      out[id] = { error: err.message, columns: [], schema: [], sample: [], sampledRows: 0 };
    }
  }

  res.json({ sampleSize: cap, nodes: out });
});

export default router;
