import express from 'express';
import { topologicalSort, inputsFor } from '../engine/topologicalSort.js';
import { executeNode } from '../engine/executeNode.js';

const router = express.Router();

// NDJSON stream of per-node progress
router.post('/run-pipeline', async (req, res) => {
  const { nodes = [], edges = [] } = req.body || {};
  res.setHeader('Content-Type', 'application/x-ndjson');
  // Prevent browsers from MIME-sniffing the streamed payload as HTML,
  // which would otherwise let user-controlled node output render as XSS.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const write = (obj) => res.write(JSON.stringify(obj) + '\n');

  let order;
  try {
    order = topologicalSort(nodes, edges);
  } catch (err) {
    write({ type: 'error', error: err.message });
    res.end();
    return;
  }

  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const results = {};

  for (const id of order) {
    const node = byId[id];
    write({ type: 'node', nodeId: id, status: 'running' });
    try {
      const input = inputsFor(id, nodes, edges, results);
      const out = executeNode(node, input);
      results[id] = out;
      write({
        type: 'node',
        nodeId: id,
        status: 'success',
        rowCount: out.meta?.rowCount ?? out.rows.length,
        meta: out.meta,
        sample: out.rows.slice(0, 3),
        rows: out.rows, // include full output so client can stage Dataverse imports
      });
    } catch (err) {
      results[id] = { rows: [], meta: { error: err.message } };
      write({ type: 'node', nodeId: id, status: 'error', error: err.message });
    }
  }
  write({ type: 'done' });
  res.end();
});

export default router;
