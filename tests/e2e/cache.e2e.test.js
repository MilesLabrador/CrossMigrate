import { describe, it, expect, inject, afterAll } from 'vitest';

const baseUrl = inject('baseUrl');

// Unique cache keys per run so reruns never see each other's files; every key
// used here is deleted through the API afterwards.
const runId = `cachetest-${Date.now().toString(36)}`;
const usedKeys = new Set();
const key = (name) => {
  const k = `${runId}-${name}`;
  usedKeys.add(k);
  return k;
};
afterAll(async () => {
  for (const k of usedKeys) {
    await fetch(`${baseUrl}/api/cache?key=${encodeURIComponent(k)}`, { method: 'DELETE' });
  }
});

async function runPipeline(nodes, edges) {
  const res = await fetch(`${baseUrl}/api/run-pipeline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodes, edges }),
  });
  const lines = (await res.text()).split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const success = {};
  for (const line of lines) {
    if (line.type === 'node' && line.status === 'success') success[line.nodeId] = line;
  }
  return success;
}

const graph = (cacheKey, rows, mode = 'auto') => ({
  nodes: [
    { id: 'src', type: 'manualData', data: { rows } },
    { id: 'cache', type: 'cache', data: { config: { mode, cacheKey } } },
    { id: 'view', type: 'preview', data: {} },
  ],
  edges: [
    { source: 'src', target: 'cache' },
    { source: 'cache', target: 'view' },
  ],
});

const status = (k) =>
  fetch(`${baseUrl}/api/cache-status?key=${encodeURIComponent(k)}`).then((r) => r.json());

describe('cache node', () => {
  it('caches rows on the first run and serves them when upstream arrives empty', async () => {
    const k = key('roundtrip');
    const rows = [{ id: 'a' }, { id: 'b' }];

    // First run: cold cache fills from the source.
    const first = await runPipeline(...Object.values(graph(k, rows)));
    expect(first.cache.meta.cached).toBe(true);
    expect(first.view.rows).toEqual(rows);

    // Second run: the source has NO rows (as if never fetched) — the warm
    // cache serves anyway, schema included.
    const second = await runPipeline(...Object.values(graph(k, [])));
    expect(second.cache.meta.fromCache).toBe(true);
    expect(second.view.rows).toEqual(rows);
    expect(second.cache.schema).toEqual([{ name: 'id', type: 'text' }]);
  });

  it('refresh mode overwrites a warm cache with the new input', async () => {
    const k = key('refresh');
    await runPipeline(...Object.values(graph(k, [{ v: 'old' }])));
    const after = await runPipeline(...Object.values(graph(k, [{ v: 'new' }], 'refresh')));
    expect(after.view.rows).toEqual([{ v: 'new' }]);

    // And auto mode now serves the refreshed rows.
    const readback = await runPipeline(...Object.values(graph(k, [])));
    expect(readback.view.rows).toEqual([{ v: 'new' }]);
  });

  it('bypass mode passes rows through without touching the cache', async () => {
    const k = key('bypass');
    const res = await runPipeline(...Object.values(graph(k, [{ v: 1 }], 'bypass')));
    expect(res.cache.meta.bypassed).toBe(true);
    expect((await status(k)).exists).toBe(false);
  });

  it('never caches an empty input on a cold cache', async () => {
    const k = key('cold-empty');
    const res = await runPipeline(...Object.values(graph(k, [])));
    expect(res.cache.meta.warning).toMatch(/cold/i);
    expect((await status(k)).exists).toBe(false);
  });

  it('lists warm caches with their columns for the Lookup picker', async () => {
    const k = key('listing');
    await runPipeline(...Object.values(graph(k, [{ genre: 'RCK', genre_name: 'Rock' }])));

    const { caches } = await fetch(`${baseUrl}/api/caches`).then((r) => r.json());
    const mine = caches.find((c) => c.key === k);
    expect(mine).toBeDefined();
    expect(mine.rowCount).toBe(1);
    expect(mine.columns).toEqual(['genre', 'genre_name']);
    expect(mine.sample).toEqual([{ genre: 'RCK', genre_name: 'Rock' }]);
  });

  it('feeds a Lookup node: a cached reference table maps values with no inline mappings', async () => {
    const k = key('genre');
    // Cache the reference table once …
    await runPipeline(...Object.values(graph(k, [
      { genre: 'RCK', genre_name: 'Rock' },
      { genre: 'JZZ', genre_name: 'Jazz' },
    ])));

    // … then a separate pipeline maps against it by name alone: no mapping
    // pairs, no key/value columns — both are detected from the cached table.
    const res = await runPipeline(
      [
        { id: 'src', type: 'manualData', data: { rows: [{ genre: 'RCK' }, { genre: 'JZZ' }, { genre: 'ZZZ' }] } },
        { id: 'look', type: 'lookup', data: { config: { lookupColumn: 'genre', mappingSource: 'cache', cacheKey: k } } },
        { id: 'view', type: 'preview', data: {} },
      ],
      [{ source: 'src', target: 'look' }, { source: 'look', target: 'view' }]
    );

    expect(res.view.rows).toEqual([{ genre: 'Rock' }, { genre: 'Jazz' }, { genre: 'ZZZ' }]);
    expect(res.look.meta.mappingSource).toBe('cache');
    expect(res.look.meta.cacheKeyColumn).toBe('genre');
    expect(res.look.meta.cacheValueColumn).toBe('genre_name');
    expect(res.look.meta.matched).toBe(2);
    expect(res.look.meta.unmatched).toBe(1);
  });

  it('cache-status reports warm caches and DELETE clears them', async () => {
    const k = key('lifecycle');
    await runPipeline(...Object.values(graph(k, [{ v: 1 }, { v: 2 }])));

    const warm = await status(k);
    expect(warm.exists).toBe(true);
    expect(warm.rowCount).toBe(2);
    expect(warm.cachedAt).toBeGreaterThan(0);

    const del = await fetch(`${baseUrl}/api/cache?key=${encodeURIComponent(k)}`, { method: 'DELETE' });
    expect(del.status).toBe(200);
    expect((await status(k)).exists).toBe(false);
  });
});
