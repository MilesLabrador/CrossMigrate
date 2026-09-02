import { describe, it, expect, inject } from 'vitest';

const baseUrl = inject('baseUrl');

async function collect(body) {
  const res = await fetch(`${baseUrl}/api/collect-metadata`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { res, body: await res.json() };
}

describe('POST /api/collect-metadata', () => {
  it('returns columns, schema, and a small sample for every node in the graph', async () => {
    const nodes = [
      {
        id: 'src',
        type: 'manualData',
        data: { rows: [{ amount: '10', name: 'Ada' }, { amount: '20', name: 'Bo' }] },
      },
      {
        id: 'map',
        type: 'selectMap',
        data: { config: { mappings: [{ source: 'amount', target: 'value' }] } },
      },
    ];
    const edges = [{ source: 'src', target: 'map' }];

    const { res, body } = await collect({ nodes, edges });
    expect(res.status).toBe(200);
    expect(body.nodes.src.columns).toEqual(['amount', 'name']);
    expect(body.nodes.src.schema).toEqual([
      { name: 'amount', type: 'number' },
      { name: 'name', type: 'text' },
    ]);
    // The rename is visible downstream, with the source column's type carried.
    expect(body.nodes.map.columns).toEqual(['value']);
    expect(body.nodes.map.schema).toEqual([{ name: 'value', type: 'number' }]);
    expect(body.nodes.map.sample.length).toBeLessThanOrEqual(3);
  });

  it('caps source rows at the sample size so the dry run stays cheap', async () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({ n: i }));
    const nodes = [{ id: 'src', type: 'manualData', data: { rows } }];

    const { body } = await collect({ nodes, edges: [], sampleSize: 10 });
    expect(body.sampleSize).toBe(10);
    expect(body.nodes.src.sampledRows).toBe(10);
  });

  it('reports a broken node without hiding metadata for the rest of the graph', async () => {
    const nodes = [
      { id: 'src', type: 'manualData', data: { rows: [{ amount: 'oops' }] } },
      {
        id: 'convert',
        type: 'convertTypes',
        data: { config: { conversions: [{ field: 'amount', type: 'number', onError: 'fail' }] } },
      },
      { id: 'ok', type: 'preview', data: {} },
    ];
    const edges = [
      { source: 'src', target: 'convert' },
      { source: 'src', target: 'ok' },
    ];

    const { body } = await collect({ nodes, edges });
    expect(body.nodes.convert.error).toMatch(/cannot convert/i);
    expect(body.nodes.ok.columns).toEqual(['amount']);
  });

  it('rejects a cyclic graph with 400', async () => {
    const nodes = [
      { id: 'a', type: 'deduplicate', data: {} },
      { id: 'b', type: 'deduplicate', data: {} },
    ];
    const edges = [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'a' },
    ];

    const { res, body } = await collect({ nodes, edges });
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/cycle/i);
  });
});
