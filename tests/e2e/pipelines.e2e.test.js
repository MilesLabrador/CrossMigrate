import { describe, it, expect, inject, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const baseUrl = inject('baseUrl');
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const pipelinesDir = path.join(repoRoot, 'server', 'pipelines');

// Unique per run so reruns never collide with leftover files.
const runId = `test-${Date.now().toString(36)}`;
const savedIds = [];

// Mirrors the route's filename sanitization so cleanup can find the files.
const fileFor = (id) => path.join(pipelinesDir, `${id.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
afterAll(() => {
  for (const id of savedIds) fs.rmSync(fileFor(id), { force: true });
});

async function save(id, payload) {
  savedIds.push(id);
  return fetch(`${baseUrl}/api/pipelines/${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

const load = (id) =>
  fetch(`${baseUrl}/api/pipelines/${encodeURIComponent(id)}`).then((r) => r.json());

describe('/api/pipelines/:id', () => {
  const pipeline = {
    projectName: 'Roundtrip test',
    nodes: [{ id: 'src', type: 'manualData', data: {} }],
    edges: [{ source: 'src', target: 'view' }],
  };

  it('POST then GET round-trips projectName, nodes, and edges', async () => {
    const id = `${runId}-roundtrip`;
    const res = await save(id, pipeline);
    expect(res.status).toBe(200);

    const loaded = await load(id);
    expect(loaded).toMatchObject(pipeline);
  });

  it('POST returns ok with an updatedAt timestamp', async () => {
    const before = Date.now();
    const res = await save(`${runId}-timestamp`, pipeline);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.updatedAt).toBeGreaterThanOrEqual(before);
    expect(body.updatedAt).toBeLessThanOrEqual(Date.now());
  });

  it('GET returns null (not 404) for an id that was never saved', async () => {
    const res = await fetch(`${baseUrl}/api/pipelines/${runId}-never-saved`);
    expect(res.status).toBe(200);
    expect(await res.json()).toBe(null);
  });

  it('POST returns 400 when nodes or edges is not an array', async () => {
    const res = await save(`${runId}-invalid`, { nodes: 'nope', edges: [] });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/nodes and edges/i);
  });

  it('POST defaults a missing projectName to "Untitled pipeline"', async () => {
    const id = `${runId}-unnamed`;
    await save(id, { nodes: [], edges: [] });
    expect((await load(id)).projectName).toBe('Untitled pipeline');
  });

  it('sanitizes the id — a path-traversal id cannot write outside the pipelines dir', async () => {
    const id = `../../pwned-${runId}`;
    const res = await save(id, { nodes: [], edges: [] });
    expect(res.status).toBe(200);

    // The write must land inside server/pipelines under a sanitized name…
    expect(fs.existsSync(fileFor(id))).toBe(true);
    // …and never where the raw id pointed.
    expect(fs.existsSync(path.join(repoRoot, `pwned-${runId}.json`))).toBe(false);
    expect(fs.existsSync(path.join(repoRoot, 'server', `pwned-${runId}.json`))).toBe(false);

    // The same weird id still round-trips through the API.
    expect(await load(id)).toMatchObject({ nodes: [], edges: [] });
  });
});
