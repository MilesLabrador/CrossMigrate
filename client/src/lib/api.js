// Thin API wrappers — Vite proxies /api -> :3001
export async function fetchEntities(orgUrl = '') {
  const qs = orgUrl ? `?orgUrl=${encodeURIComponent(orgUrl)}` : '';
  const r = await fetch(`/api/entities${qs}`);
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    const detail = body?.error?.message || body?.error || body?.message || `HTTP ${r.status}`;
    throw new Error(String(detail));
  }
  return r.json();
}

export async function fetchEntityFields(logicalName, orgUrl = '') {
  const qs = orgUrl ? `?orgUrl=${encodeURIComponent(orgUrl)}` : '';
  const r = await fetch(`/api/entities/${encodeURIComponent(logicalName)}/fields${qs}`);
  if (!r.ok) throw new Error(`fields: ${r.status}`);
  return r.json();
}

export async function uploadCsv(file, { delimiter = '', header = true, encoding = 'utf8' } = {}) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('delimiter', delimiter);
  fd.append('header', String(header));
  fd.append('encoding', encoding);
  const r = await fetch('/api/upload-csv', { method: 'POST', body: fd });
  if (!r.ok) throw new Error(`upload-csv: ${r.status}`);
  return r.json();
}

// NDJSON stream from /api/run-pipeline. onEvent(parsedObj) for each line.
export async function runPipelineStream({ nodes, edges }, onEvent) {
  const r = await fetch('/api/run-pipeline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodes, edges }),
  });
  if (!r.ok || !r.body) throw new Error(`run-pipeline: ${r.status}`);
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        onEvent(JSON.parse(line));
      } catch {
        /* ignore parse errors */
      }
    }
  }
  if (buf.trim()) {
    try {
      onEvent(JSON.parse(buf));
    } catch {
      /* ignore */
    }
  }
}

// Fetch rows from a Dataverse table
export async function fetchDataverseRows({ entity, select = '', filter = '', top = 5000, orgUrl = '' }) {
  const r = await fetch('/api/fetch-dataverse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entity, select, filter, top, orgUrl }),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error || `fetch-dataverse: ${r.status}`);
  }
  return r.json(); // { rows, columns, rowCount }
}

// SSE for Dataverse import
export async function importToDataverseSSE({ entity, rows, orgUrl = '' }, onEvent) {
  const r = await fetch('/api/import-dataverse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entity, rows, orgUrl }),
  });
  if (!r.ok || !r.body) throw new Error(`import-dataverse: ${r.status}`);
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const line = chunk.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      try {
        onEvent(JSON.parse(line.slice(5).trim()));
      } catch {
        /* ignore */
      }
    }
  }
}
