// Thin API wrappers — Vite proxies /api -> :3001
export async function fetchPipeline(id) {
  const r = await fetch(`/api/pipelines/${encodeURIComponent(id)}`);
  if (!r.ok) throw new Error(`pipelines: ${r.status}`);
  return r.json(); // null if never saved
}

export async function savePipelineRemote(id, { projectName, nodes, edges }) {
  const r = await fetch(`/api/pipelines/${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectName, nodes, edges }),
  });
  if (!r.ok) throw new Error(`pipelines: ${r.status}`);
  return r.json();
}

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

export async function uploadXlsx(file, { header = true, sheet = '' } = {}) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('header', String(header));
  if (sheet) fd.append('sheet', sheet);
  const r = await fetch('/api/upload-xlsx', { method: 'POST', body: fd });
  if (!r.ok) throw new Error(`upload-xlsx: ${r.status}`);
  return r.json();
}

export async function fetchXlsxSheet(fileId, { sheet, header = true } = {}) {
  const qs = new URLSearchParams({ fileId, header: String(header) });
  if (sheet) qs.set('sheet', sheet);
  const r = await fetch(`/api/xlsx-sheet?${qs}`);
  if (!r.ok) throw new Error(`xlsx-sheet: ${r.status}`);
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

export async function fetchViews(logicalName, orgUrl = '') {
  const qs = orgUrl ? `?orgUrl=${encodeURIComponent(orgUrl)}` : '';
  const r = await fetch(`/api/entities/${encodeURIComponent(logicalName)}/views${qs}`);
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body?.error || `views: ${r.status}`);
  }
  return r.json();
}

export async function fetchDataverseView({ entityCollection, savedQueryId, orgUrl = '', top = 5000, viewColumns = [] }) {
  const r = await fetch('/api/fetch-dataverse-view', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entityCollection, savedQueryId, orgUrl, top, expectedColumns: viewColumns }),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body?.error || `fetch-dataverse-view: ${r.status}`);
  }
  return r.json();
}

// Server errors that mean "no Microsoft account is signed in". Used by
// Dataverse-touching components to swap raw error text for a CTA into the
// Connections manager.
export function isAuthError(message) {
  if (!message) return false;
  const m = String(message);
  return (
    m.startsWith('sign-in-required:') ||
    /sign in to a microsoft account/i.test(m) ||
    /no\s+ORG_URL\s+configured/i.test(m)
  );
}

// Opens the Connections modal from anywhere. The Toolbar listens for this
// event and toggles `showSettings`. Use this instead of plumbing callbacks
// through every node config.
export function openConnectionsModal() {
  window.dispatchEvent(new CustomEvent('crossmigrate:open-connections'));
}

export async function fetchServerConfig() {
  const r = await fetch('/api/config');
  if (!r.ok) throw new Error(`config: ${r.status}`);
  return r.json();
}

export async function fetchConnections() {
  const r = await fetch('/api/connections');
  if (!r.ok) throw new Error(`connections: ${r.status}`);
  return r.json();
}

export async function startConnectionSignIn(orgUrl = '', { clientId = '', tenantId = '' } = {}) {
  const r = await fetch('/api/connections/sign-in', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orgUrl, clientId, tenantId }),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error || `sign-in: ${r.status}`);
  }
  return r.json();
}

export async function startInteractiveSignIn(orgUrl = '', { clientId = '', tenantId = '' } = {}) {
  const r = await fetch('/api/connections/interactive-sign-in', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orgUrl, clientId, tenantId }),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error || `interactive-sign-in: ${r.status}`);
  }
  return r.json(); // { authUrl }
}

export async function pollConnectionSignIn() {
  const r = await fetch('/api/connections/sign-in/status');
  if (!r.ok) throw new Error(`sign-in status: ${r.status}`);
  return r.json();
}

export async function deleteConnection(id) {
  const r = await fetch(`/api/connections/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error || `connections: ${r.status}`);
  }
  return r.json();
}

export async function activateConnection(id) {
  const r = await fetch(`/api/connections/${encodeURIComponent(id)}/activate`, { method: 'POST' });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error || `connections: ${r.status}`);
  }
  return r.json();
}

// SQL source helpers
export async function sqlConnect({ type, host, port, user, password, database, filename }) {
  const r = await fetch('/api/source/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, host, port, user, password, database, filename }),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error || `source/connect: ${r.status}`);
  }
  return r.json();
}

export async function sqlPreview({ type, host, port, user, password, database, filename, table }) {
  const r = await fetch('/api/source/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, host, port, user, password, database, filename, table }),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error || `source/preview: ${r.status}`);
  }
  return r.json();
}

export async function sqlExtract({ type, host, port, user, password, database, filename, table, columns }) {
  const r = await fetch('/api/source/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, host, port, user, password, database, filename, table, columns }),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error || `source/extract: ${r.status}`);
  }
  return r.json();
}

export async function sqlWrite({ type, host, port, user, password, database, filename, table, rows, mode, conflictColumn }) {
  const r = await fetch('/api/sql/write', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, host, port, user, password, database, filename, table, rows, mode, conflictColumn }),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error || `sql/write: ${r.status}`);
  }
  return r.json();
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
