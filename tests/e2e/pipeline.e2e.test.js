import { describe, it, expect, inject } from 'vitest';

// Base URL of the real server booted by globalSetup.js.
const baseUrl = inject('baseUrl');

// /api/run-pipeline streams NDJSON — one JSON object per line.
async function runPipeline(nodes, edges) {
  const res = await fetch(`${baseUrl}/api/run-pipeline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodes, edges }),
  });
  expect(res.ok).toBe(true);
  const text = await res.text();
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

describe('server health', () => {
  it('responds on /api/health', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe('POST /api/run-pipeline', () => {
  it('runs a manualData → deduplicate → preview pipeline end to end', async () => {
    const nodes = [
      {
        id: 'src',
        type: 'manualData',
        data: {
          rows: [
            { email: 'a@x.com', name: 'Alice' },
            { email: 'a@x.com', name: 'Alice dupe' },
            { email: 'b@x.com', name: 'Bob' },
          ],
        },
      },
      { id: 'dedupe', type: 'deduplicate', data: { config: { fields: ['email'] } } },
      { id: 'view', type: 'preview', data: {} },
    ];
    const edges = [
      { source: 'src', target: 'dedupe' },
      { source: 'dedupe', target: 'view' },
    ];

    const events = runPipelineEvents(await runPipeline(nodes, edges));

    // Every node succeeded and the stream finished.
    expect(events.errors).toEqual([]);
    expect(events.done).toBe(true);

    // The duplicate email was removed before reaching the preview node.
    expect(events.success.dedupe.rowCount).toBe(2);
    expect(events.success.dedupe.meta.duplicatesRemoved).toBe(1);

    // Preview nodes stream their full rows back to the client.
    expect(events.success.view.rows).toEqual([
      { email: 'a@x.com', name: 'Alice' },
      { email: 'b@x.com', name: 'Bob' },
    ]);
  });

  it('reports a cycle as a stream error instead of hanging', async () => {
    const nodes = [
      { id: 'a', type: 'deduplicate', data: {} },
      { id: 'b', type: 'deduplicate', data: {} },
    ];
    const edges = [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'a' },
    ];

    const lines = await runPipeline(nodes, edges);
    expect(lines).toEqual([{ type: 'error', error: expect.stringMatching(/cycle/i) }]);
  });

  // Join is the first multi-input node — these exercise the handleInputs
  // wiring (edge targetHandle → left/right), not the join logic itself
  // (that's unit-tested in tests/unit/executeNode.test.js).
  const joinNodes = [
    { id: 'people', type: 'manualData', data: { rows: [{ id: 1, name: 'Ada' }, { id: 2, name: 'Bo' }] } },
    { id: 'cities', type: 'manualData', data: { rows: [{ id: 1, city: 'Oslo' }] } },
    { id: 'join', type: 'join', data: { config: { leftColumn: 'id', rightColumn: 'id' } } },
    { id: 'view', type: 'preview', data: {} },
  ];

  it('runs a two-input join pipeline (manualData ×2 → join → preview) end to end', async () => {
    const edges = [
      { source: 'people', target: 'join', targetHandle: 'left' },
      { source: 'cities', target: 'join', targetHandle: 'right' },
      { source: 'join', target: 'view' },
    ];
    const events = runPipelineEvents(await runPipeline(joinNodes, edges));

    expect(events.errors).toEqual([]);
    expect(events.done).toBe(true);
    expect(events.success.join.meta.matched).toBe(1);
    expect(events.success.view.rows).toEqual([
      { id: 1, name: 'Ada', city: 'Oslo' },
      { id: 2, name: 'Bo', city: null },
    ]);
  });

  it('routes edges to the join node by targetHandle (left vs right)', async () => {
    // Same graph with the handles swapped: cities is now the left input, so
    // the output is city rows enriched with names — proving rows follow the
    // handle they arrive on, not edge order.
    const edges = [
      { source: 'people', target: 'join', targetHandle: 'right' },
      { source: 'cities', target: 'join', targetHandle: 'left' },
      { source: 'join', target: 'view' },
    ];
    const events = runPipelineEvents(await runPipeline(joinNodes, edges));

    expect(events.errors).toEqual([]);
    expect(events.success.view.rows).toEqual([{ id: 1, city: 'Oslo', name: 'Ada' }]);
  });

  it('streams column-type schema with every successful node event', async () => {
    const nodes = [
      { id: 'src', type: 'manualData', data: { rows: [{ id: 7, name: 'Ada' }] } },
      { id: 'view', type: 'preview', data: {} },
    ];
    const edges = [{ source: 'src', target: 'view' }];

    const events = runPipelineEvents(await runPipeline(nodes, edges));
    const expected = [
      { name: 'id', type: 'number' },
      { name: 'name', type: 'text' },
    ];
    expect(events.success.src.schema).toEqual(expected);
    // Preview passes the schema through unchanged.
    expect(events.success.view.schema).toEqual(expected);
  });

  it('routes Convert Types redirected rows along the errors output handle', async () => {
    const nodes = [
      {
        id: 'src',
        type: 'manualData',
        data: { rows: [{ amount: '10' }, { amount: 'oops' }, { amount: '30' }] },
      },
      {
        id: 'convert',
        type: 'convertTypes',
        data: { config: { conversions: [{ field: 'amount', type: 'number', onError: 'redirect' }] } },
      },
      { id: 'good', type: 'preview', data: {} },
      { id: 'bad', type: 'preview', data: {} },
    ];
    const edges = [
      { source: 'src', target: 'convert' },
      { source: 'convert', target: 'good' },
      { source: 'convert', target: 'bad', sourceHandle: 'errors' },
    ];

    const events = runPipelineEvents(await runPipeline(nodes, edges));
    expect(events.errors).toEqual([]);
    expect(events.success.good.rows).toEqual([{ amount: 10 }, { amount: 30 }]);
    expect(events.success.bad.rows).toEqual([
      { amount: 'oops', _error: 'cannot convert "oops" in "amount" to number' },
    ]);
    expect(events.success.convert.meta.diverted).toBe(1);
  });
});

// Folds the raw NDJSON lines into an easy-to-assert shape.
function runPipelineEvents(lines) {
  const success = {};
  const errors = [];
  let done = false;
  for (const line of lines) {
    if (line.type === 'done') done = true;
    if (line.type === 'error') errors.push(line.error);
    if (line.type === 'node' && line.status === 'error') errors.push(line.error);
    if (line.type === 'node' && line.status === 'success') success[line.nodeId] = line;
  }
  return { success, errors, done };
}
