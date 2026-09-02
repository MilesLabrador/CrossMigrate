import { create } from 'zustand';
import { applyNodeChanges, applyEdgeChanges, addEdge } from '@xyflow/react';
import { nanoid } from 'nanoid';
import { fetchPipeline, savePipelineRemote } from '../lib/api';

const ENV_KEY = 'crossmigrate:environments';

const STORAGE_KEY = 'crossmigrate:pipeline';
const PIPELINE_ID_KEY = 'crossmigrate:pipelineId';

// The backend identifies a saved pipeline by this id (server/pipelines/<id>.json).
// It's generated once per browser and reused across saves/reloads — there's no
// project list UI yet, so this just gives autosave a stable file to sync to.
function getOrCreatePipelineId() {
  let id = localStorage.getItem(PIPELINE_ID_KEY);
  if (!id) {
    id = nanoid(10);
    localStorage.setItem(PIPELINE_ID_KEY, id);
  }
  return id;
}

export const NODE_DEFAULTS = {
  // Unified Dataverse source: `mode` switches between an OData column query and
  // a saved Power Platform view (FetchXML). Carries fields for both so toggling
  // mode in the config panel doesn't lose the other side's selection.
  dataverseInput: { config: { mode: 'columns', orgUrl: '', entity: '', entityLogicalName: '', entityDisplayName: '', select: '', filter: '', top: 5000, viewId: '', viewName: '', fetchXml: '', viewColumns: [] }, rows: [], columns: [] },
  xlsxInput: { config: { header: true }, rows: [], columns: [] },
  csvInput: { config: {}, rows: [], columns: [] },
  manualData: {
    config: {},
    columns: ['col1', 'col2', 'col3'],
    rows: [],
  },
  selectMap: { config: { mappings: [] } },
  filter: { config: { combinator: 'AND', conditions: [] } },
  transform: { config: { fieldTransforms: [] } },
  // Explicit per-field casts (text/number/boolean/date) with per-field error
  // handling. onError: 'fail' (abort node) | 'null' (null the value) |
  // 'redirect' (send the row to the node's error output handle).
  convertTypes: { config: { conversions: [] } },
  // Match a column's value against an inline { from → to } mapping table and
  // write the mapped value into a target column (blank target = overwrite in
  // place). Unmatched rows follow noMatch: 'keep' (pass original value) |
  // 'null' | 'default' (use defaultValue) | 'redirect' (to error output).
  // mappingSource: 'inline' (pairs typed below) | 'cache' (two columns of a
  // warm Cache entry, auto-detected when the column fields are left blank).
  lookup: { config: { lookupColumn: '', targetColumn: '', mappingSource: 'inline', mappings: [], cacheKey: '', cacheKeyColumn: '', cacheValueColumn: '', caseInsensitive: false, noMatch: 'keep', defaultValue: '' } },
  // Server-side row cache. mode: 'auto' (serve warm cache, else fill) |
  // 'refresh' (always rewrite) | 'bypass' (pass through untouched).
  cache: { config: { mode: 'auto' } },
  selectColumns: { config: { columns: [] } },
  deduplicate:  { config: { fields: [], strategy: 'first' } },
  // Two-input node: 'left' handle carries the rows being enriched, 'right'
  // carries the table being joined in. joinType: 'left' | 'inner'.
  join: { config: { leftColumn: '', rightColumn: '', pullColumns: [], joinType: 'left', prefix: '', caseInsensitive: false } },
  randomSample: { config: { size: 100, withReplacement: false } },
  preview: { config: {} },
  previewColumns: { config: {} },
  csvExport: { config: { filename: 'export.csv', delimiter: ',' } },
  dataverseOutput: { config: { orgUrl: '', entity: '', fieldMappings: [] } },
  sqlInput:  { config: { type: 'postgres', host: 'localhost', port: '5432', user: '', password: '', database: '', table: '' }, rows: [], columns: [] },
  sqlOutput: { config: { type: 'postgres', host: 'localhost', port: '5432', user: '', password: '', database: '', table: '', mode: 'insert', conflictColumn: '' } },
  fieldUsage: { config: {} },
  group: { config: { notes: '' } },
};

// Input handles that only accept a single incoming connection. Most nodes
// deliberately union rows from every incoming edge, but a join key handle
// refers to exactly one table — connecting a new source replaces the existing
// edge (and resets that side's config) instead of silently merging.
const SINGLE_INPUT_HANDLES = {
  join: new Set(['left', 'right']),
};

// Rough footprint used only for sizing a new group's bounding box — node
// cards aren't measured here, so this is an estimate, not a layout source of truth.
const DEFAULT_NODE_W = 256;
const DEFAULT_NODE_H = 110;

function loadEnvironments() {
  try {
    const raw = localStorage.getItem(ENV_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

const initial = {
  projectName: 'Untitled pipeline',
  nodes: [],
  edges: [],
  selectedNodeId: null,
  configPanelOpen: false,
  running: false,
  nodeStatus: {},
  drag: null,
  pipelineId: getOrCreatePipelineId(),
  autosaveStatus: 'idle', // 'idle' | 'saving' | 'saved' | 'error'
};

export const usePipelineStore = create((set, get) => ({
  ...initial,

  // ─── Environments (persisted separately from pipeline) ─────────────────────
  environments: loadEnvironments(),  // [{ id, name, orgUrl }]
  activeEnvId: null,

  addEnvironment: (name, orgUrl) => {
    const env = { id: nanoid(6), name, orgUrl };
    const envs = [...get().environments, env];
    localStorage.setItem(ENV_KEY, JSON.stringify(envs));
    set({ environments: envs, activeEnvId: env.id });
  },
  updateEnvironment: (id, patch) => {
    const envs = get().environments.map((e) => e.id === id ? { ...e, ...patch } : e);
    localStorage.setItem(ENV_KEY, JSON.stringify(envs));
    set({ environments: envs });
  },
  removeEnvironment: (id) => {
    const envs = get().environments.filter((e) => e.id !== id);
    localStorage.setItem(ENV_KEY, JSON.stringify(envs));
    const activeEnvId = get().activeEnvId === id
      ? (envs[0]?.id || null)
      : get().activeEnvId;
    set({ environments: envs, activeEnvId });
  },
  setActiveEnv: (id) => set({ activeEnvId: id }),
  getActiveOrgUrl: () => {
    const { environments, activeEnvId } = get();
    return environments.find((e) => e.id === activeEnvId)?.orgUrl || '';
  },

  setProjectName: (name) => set({ projectName: name }),

  startDrag: (type, x, y) => set({ drag: { type, ghostX: x, ghostY: y } }),
  moveDrag:  (x, y)       => set((s) => s.drag ? { drag: { ...s.drag, ghostX: x, ghostY: y } } : {}),
  endDrag:   ()            => set({ drag: null }),

  onNodesChange: (changes) => set({ nodes: applyNodeChanges(changes, get().nodes) }),
  onEdgesChange: (changes) => {
    const removedIds = changes.filter((c) => c.type === 'remove').map((c) => c.id);
    const removedEdges = get().edges.filter((e) => removedIds.includes(e.id));
    set({ edges: applyEdgeChanges(changes, get().edges) });
    if (removedEdges.length) get().clearDownstreamConfigsForRemovedEdges(removedEdges);
  },
  onConnect: (conn) => {
    let edges = get().edges;
    let displaced = [];
    const targetNode = get().nodes.find((n) => n.id === conn.target);
    if (SINGLE_INPUT_HANDLES[targetNode?.type]?.has(conn.targetHandle)) {
      // Keep reconnections from the same source out of `displaced` so they
      // don't needlessly reset the node's config (addEdge dedupes them anyway).
      displaced = edges.filter(
        (e) => e.target === conn.target && e.targetHandle === conn.targetHandle && e.source !== conn.source
      );
      if (displaced.length) edges = edges.filter((e) => !displaced.includes(e));
    }
    set({
      edges: addEdge(
        { ...conn, type: 'default', animated: false, data: { fieldCount: 0 } },
        edges
      ),
    });
    if (displaced.length) get().clearDownstreamConfigsForRemovedEdges(displaced);
  },

  addNode: (type, position) => {
    const id = `${type}_${nanoid(6)}`;
    const defaults = NODE_DEFAULTS[type] || { config: {} };
    const node = {
      id,
      type,
      position: snap(position),
      data: { name: prettyName(type), ...defaults },
    };
    set({ nodes: [...get().nodes, node] });
    return id;
  },

  updateNodeData: (id, patch) =>
    set({
      nodes: get().nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...patch } } : n
      ),
    }),

  updateNodeConfig: (id, configPatch) =>
    set({
      nodes: get().nodes.map((n) =>
        n.id === id
          ? { ...n, data: { ...n.data, config: { ...(n.data.config || {}), ...configPatch } } }
          : n
      ),
    }),

  deleteNode: (id) => get().deleteNodes([id]),

  deleteNodes: (ids) => {
    const idSet = new Set(ids);
    const allNodes = get().nodes;
    // Children of a deleted group lose their parent — convert their position
    // back to absolute (canvas-space) so they don't jump/disappear, rather
    // than cascading the delete onto them.
    const removedParents = new Map(
      allNodes.filter((n) => idSet.has(n.id) && n.type === 'group').map((n) => [n.id, n.position])
    );
    set({
      nodes: allNodes
        .filter((n) => !idSet.has(n.id))
        .map((n) => {
          if (!n.parentId || !removedParents.has(n.parentId)) return n;
          const parentPos = removedParents.get(n.parentId);
          const { parentId, extent, ...rest } = n;
          return { ...rest, position: { x: n.position.x + parentPos.x, y: n.position.y + parentPos.y } };
        }),
      edges: get().edges.filter((e) => !idSet.has(e.source) && !idSet.has(e.target)),
      selectedNodeId: idSet.has(get().selectedNodeId) ? null : get().selectedNodeId,
      configPanelOpen: idSet.has(get().selectedNodeId) ? false : get().configPanelOpen,
    });
  },

  duplicateNode: (id) => get().duplicateNodes([id])[0],

  duplicateNodes: (ids) => {
    const allNodes = get().nodes;
    const targets = allNodes.filter((n) => ids.includes(n.id));
    if (!targets.length) return [];
    const idMap = new Map(targets.map((n) => [n.id, `${n.type}_${nanoid(6)}`]));
    const copies = targets.map((n) => ({
      ...n,
      id: idMap.get(n.id),
      // Re-point to a duplicated parent if it's in the same batch; otherwise
      // keep belonging to the original (un-duplicated) group.
      parentId: n.parentId && idMap.has(n.parentId) ? idMap.get(n.parentId) : n.parentId,
      position: n.parentId ? n.position : snap({ x: n.position.x + 40, y: n.position.y + 40 }),
      selected: false,
      data: { ...n.data, config: { ...(n.data.config || {}) } },
    }));
    set({ nodes: [...allNodes, ...copies] });
    return copies.map((c) => c.id);
  },

  groupNodes: (ids) => {
    const allNodes = get().nodes;
    const targets = allNodes.filter((n) => ids.includes(n.id) && !n.parentId && n.type !== 'group');
    if (targets.length < 2) return;

    const PAD_TOP = 56;
    const PAD = 24;
    const left   = Math.min(...targets.map((n) => n.position.x));
    const top    = Math.min(...targets.map((n) => n.position.y));
    const right  = Math.max(...targets.map((n) => n.position.x + (n.data?._width  || DEFAULT_NODE_W)));
    const bottom = Math.max(...targets.map((n) => n.position.y + (n.data?._height || DEFAULT_NODE_H)));

    const groupId = `group_${nanoid(6)}`;
    const groupPos = { x: left - PAD, y: top - PAD_TOP };
    const groupNode = {
      id: groupId,
      type: 'group',
      position: groupPos,
      style: { width: (right - left) + PAD * 2, height: (bottom - top) + PAD_TOP + PAD },
      dragHandle: '.group-drag-handle',
      data: { name: 'Group', config: { notes: '' } },
    };

    const targetIds = new Set(targets.map((n) => n.id));
    const newNodes = [];
    let inserted = false;
    for (const n of allNodes) {
      if (targetIds.has(n.id)) {
        if (!inserted) { newNodes.push(groupNode); inserted = true; }
        newNodes.push({
          ...n,
          parentId: groupId,
          extent: 'parent',
          selected: false,
          position: { x: n.position.x - groupPos.x, y: n.position.y - groupPos.y },
        });
      } else {
        newNodes.push(n);
      }
    }
    if (!inserted) newNodes.push(groupNode);

    set({ nodes: newNodes, selectedNodeId: groupId, configPanelOpen: true });
    return groupId;
  },

  // NodeShell's onClick stops the React synthetic 'click' from bubbling, but
  // React Flow's own node selection (addSelectedNodes) is triggered earlier,
  // on the native 'mousedown' phase, by its internal drag library (XYDrag) —
  // a separate, non-React listener that stopPropagation on 'click' can't
  // block. So real clicks already get `node.selected` set correctly through
  // React Flow's own path; this action only needs to own selectedNodeId/the
  // config panel. (An earlier version also wrote `selected` here directly,
  // which double-drove selection alongside React Flow's own mousedown path
  // and caused an update-depth crash specifically on edge-connected nodes.)
  selectNode: (id) => set({ selectedNodeId: id, configPanelOpen: !!id }),
  closeConfigPanel: () => set({ configPanelOpen: false }),

  clearCanvas: () => set({ ...initial, projectName: get().projectName }),

  setRunning: (v) => set({ running: v }),
  setNodeStatus: (id, status) =>
    set({ nodeStatus: { ...get().nodeStatus, [id]: { ...(get().nodeStatus[id] || {}), ...status } } }),
  resetNodeStatuses: () => set({ nodeStatus: {} }),

  clearDownstreamConfigsForRemovedEdges: (removedEdges) => {
    // Any node that lost an incoming edge has its column-dependent config reset
    const targets = new Set(removedEdges.map((e) => e.target));
    if (!targets.size) return;
    set({
      nodes: get().nodes.map((n) => {
        if (!targets.has(n.id)) return n;
        if (n.type === 'selectColumns') {
          return { ...n, data: { ...n.data, config: { ...n.data.config, columns: [] } } };
        }
        if (n.type === 'selectMap') {
          return { ...n, data: { ...n.data, config: { ...n.data.config, mappings: [] } } };
        }
        if (n.type === 'convertTypes') {
          return { ...n, data: { ...n.data, config: { ...n.data.config, conversions: [] } } };
        }
        if (n.type === 'lookup') {
          return { ...n, data: { ...n.data, config: { ...n.data.config, lookupColumn: '' } } };
        }
        if (n.type === 'dataverseOutput') {
          return {
            ...n,
            data: { ...n.data, config: { ...n.data.config, fieldMappings: [] } },
          };
        }
        if (n.type === 'join') {
          // Only reset the side whose input was actually disconnected
          const handles = new Set(
            removedEdges.filter((e) => e.target === n.id).map((e) => e.targetHandle || 'left')
          );
          const patch = {};
          if (handles.has('left'))  patch.leftColumn = '';
          if (handles.has('right')) { patch.rightColumn = ''; patch.pullColumns = []; }
          if (!Object.keys(patch).length) return n;
          return { ...n, data: { ...n.data, config: { ...n.data.config, ...patch } } };
        }
        return n;
      }),
    });
  },

  save: () => {
    const { projectName, nodes, edges } = get();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ projectName, nodes: persistableNodes(nodes), edges, updatedAt: Date.now() }));
      return true;
    } catch {
      // Quota exceeded (large source rows) — the remote autosave still covers us.
      return false;
    }
  },
  load: () => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    try {
      const { projectName, nodes, edges } = JSON.parse(raw);
      set({ projectName, nodes: migrateNodes(nodes || []), edges: edges || [], nodeStatus: {} });
      return true;
    } catch {
      return false;
    }
  },
  // Pushes the current pipeline to the server (server/pipelines/<pipelineId>.json)
  // so autosave survives more than just this browser's localStorage. Best-effort —
  // network hiccups shouldn't interrupt editing, so failures only surface via
  // `autosaveStatus` for the toolbar's indicator.
  syncRemote: async () => {
    const { pipelineId, projectName, nodes, edges } = get();
    set({ autosaveStatus: 'saving' });
    try {
      await savePipelineRemote(pipelineId, { projectName, nodes: persistableNodes(nodes), edges });
      set({ autosaveStatus: 'saved' });
    } catch {
      set({ autosaveStatus: 'error' });
    }
  },
  // Hydrates from the server copy if one exists — used on startup so a browser
  // that has lost its localStorage (or never had one) still recovers the last
  // autosaved pipeline for this id.
  loadRemote: async () => {
    const { pipelineId } = get();
    try {
      const remote = await fetchPipeline(pipelineId);
      if (!remote) return false;
      set({
        projectName: remote.projectName || 'Untitled pipeline',
        nodes: migrateNodes(remote.nodes || []),
        edges: remote.edges || [],
        nodeStatus: {},
      });
      return true;
    } catch {
      return false;
    }
  },
  loadFromObject: ({ projectName, nodes, edges }) => {
    set({ projectName: projectName || 'Untitled pipeline', nodes: migrateNodes(nodes || []), edges: edges || [], nodeStatus: {}, selectedNodeId: null, configPanelOpen: false });
  },
  serialize: () => {
    const { projectName, nodes, edges } = get();
    return { projectName, nodes: persistableNodes(nodes), edges };
  },
}));

// Strip run artifacts before persisting. `_producedRows` is a full copy of a
// node's last output, kept in memory for preview/export/import staging — saving
// it would multiply the payload by the number of output nodes and can blow the
// localStorage quota. `_metaRows` is the small sample fetched by Collect
// metadata — session-scoped scaffolding, not data. Source nodes' own `rows`
// stay: they ARE the input data.
function persistableNodes(nodes) {
  return nodes.map((n) => {
    if (n.data?._producedRows === undefined && n.data?._metaRows === undefined && n.data?._cache === undefined) return n;
    const { _producedRows, _metaRows, _cache, ...data } = n.data;
    return { ...n, data };
  });
}

// Dev-only escape hatch for driving the real store instance from the console /
// automated browser checks (a dynamic import would get a separate module copy).
if (import.meta.env.DEV) window.__pipelineStore = usePipelineStore;

// ── One-time schema migration ─────────────────────────────────────────────────
// The standalone `dataverseView` node was folded into `dataverseInput` with
// `mode: 'view'`. Rewrite any legacy nodes on load so old saved/imported
// pipelines keep working without the legacy components.
function migrateNodes(nodes) {
  if (!Array.isArray(nodes)) return [];
  return nodes.map((n) => {
    if (n?.type !== 'dataverseView') return n;
    return {
      ...n,
      type: 'dataverseInput',
      data: {
        ...n.data,
        config: { ...(n.data?.config || {}), mode: 'view' },
      },
    };
  });
}

function snap(p) {
  const grid = 20;
  return { x: Math.round(p.x / grid) * grid, y: Math.round(p.y / grid) * grid };
}

function prettyName(type) {
  return (
    {
      dataverseInput: 'Dataverse Input',
      xlsxInput: 'XLSX Input',
      csvInput: 'CSV Input',
      manualData: 'Manual Data',
      selectColumns: 'Select Columns',
      selectMap: 'Select / Map',
      filter: 'Filter',
      transform: 'Transform',
      convertTypes: 'Convert Types',
      lookup: 'Lookup',
      cache: 'Cache',
      deduplicate:  'Deduplicate',
      join:         'Join',
      randomSample: 'Random Sample',
      preview: 'Preview',
      previewColumns: 'Preview Columns',
      fieldUsage: 'Field Usage',
      csvExport: 'CSV Export',
      dataverseOutput: 'Dataverse Output',
      sqlInput:  'SQL Input',
      sqlOutput: 'SQL Output',
      group: 'Group',
    }[type] || type
  );
}

// Helpers used elsewhere
export function getUpstreamColumns(nodeId, state) {
  return columnsFromEdges(state.edges.filter((e) => e.target === nodeId), state);
}

// Columns arriving on one specific target handle (multi-input nodes like join).
// Edges without a targetHandle count as 'left'.
export function getUpstreamColumnsForHandle(nodeId, handleId, state) {
  return columnsFromEdges(
    state.edges.filter((e) => e.target === nodeId && (e.targetHandle || 'left') === handleId),
    state
  );
}

function columnsFromEdges(incoming, state) {
  const cols = new Set();
  for (const e of incoming) {
    const upstream = state.nodes.find((n) => n.id === e.source);
    if (!upstream) continue;
    const status = state.nodeStatus[e.source];
    const rows = upstream.data?.rows;
    const fromCols = upstream.data?.columns;
    if (fromCols?.length) fromCols.forEach((c) => cols.add(c));
    // Collect metadata / runs report columns and schema explicitly — trust
    // those even when the sample rows came back empty (e.g. filtered to 0).
    else if (status?.columns?.length) status.columns.forEach((c) => cols.add(c));
    else if (status?.schema?.length) status.schema.forEach((s) => cols.add(s.name));
    else if (status?.sample?.[0]) Object.keys(status.sample[0]).forEach((c) => cols.add(c));
    else if (rows?.[0]) Object.keys(rows[0]).forEach((c) => cols.add(c));
  }
  return Array.from(cols);
}

// Column-type metadata arriving at a node, from the last run's streamed
// schema events. Empty until the pipeline has run at least once.
export function getUpstreamSchema(nodeId, state) {
  const specs = new Map();
  for (const e of state.edges.filter((ed) => ed.target === nodeId)) {
    for (const spec of state.nodeStatus[e.source]?.schema || []) {
      if (!specs.has(spec.name)) specs.set(spec.name, spec);
    }
  }
  return Array.from(specs.values());
}

export function getUpstreamSample(nodeId, state, n = 3) {
  const incoming = state.edges.filter((e) => e.target === nodeId);
  for (const e of incoming) {
    const sample = state.nodeStatus[e.source]?.sample;
    if (sample?.length) return sample.slice(0, n);
    const upstream = state.nodes.find((nn) => nn.id === e.source);
    if (upstream?.data?.rows?.length) return upstream.data.rows.slice(0, n);
  }
  return [];
}
