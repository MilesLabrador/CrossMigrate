import { create } from 'zustand';
import { applyNodeChanges, applyEdgeChanges, addEdge } from '@xyflow/react';
import { nanoid } from 'nanoid';

const ENV_KEY = 'crossmigrate:environments';

const STORAGE_KEY = 'crossmigrate:pipeline';

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
  selectColumns: { config: { columns: [] } },
  deduplicate:  { config: { fields: [], strategy: 'first' } },
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
  onConnect: (conn) =>
    set({
      edges: addEdge(
        { ...conn, type: 'default', animated: false, data: { fieldCount: 0 } },
        get().edges
      ),
    }),

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
        if (n.type === 'dataverseOutput') {
          return {
            ...n,
            data: { ...n.data, config: { ...n.data.config, fieldMappings: [] } },
          };
        }
        return n;
      }),
    });
  },

  save: () => {
    const { projectName, nodes, edges } = get();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ projectName, nodes, edges }));
    return true;
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
  loadFromObject: ({ projectName, nodes, edges }) => {
    set({ projectName: projectName || 'Untitled pipeline', nodes: migrateNodes(nodes || []), edges: edges || [], nodeStatus: {}, selectedNodeId: null, configPanelOpen: false });
  },
  serialize: () => {
    const { projectName, nodes, edges } = get();
    return { projectName, nodes, edges };
  },
}));

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
      deduplicate:  'Deduplicate',
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
  const incoming = state.edges.filter((e) => e.target === nodeId);
  const cols = new Set();
  for (const e of incoming) {
    const upstream = state.nodes.find((n) => n.id === e.source);
    if (!upstream) continue;
    const sample = state.nodeStatus[e.source]?.sample;
    const rows = upstream.data?.rows;
    const fromCols = upstream.data?.columns;
    if (fromCols?.length) fromCols.forEach((c) => cols.add(c));
    else if (sample?.[0]) Object.keys(sample[0]).forEach((c) => cols.add(c));
    else if (rows?.[0]) Object.keys(rows[0]).forEach((c) => cols.add(c));
  }
  return Array.from(cols);
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
