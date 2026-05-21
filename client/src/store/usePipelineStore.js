import { create } from 'zustand';
import { applyNodeChanges, applyEdgeChanges, addEdge } from '@xyflow/react';
import { nanoid } from 'nanoid';

const STORAGE_KEY = 'crossmigrate:pipeline';

export const NODE_DEFAULTS = {
  csvInput: { config: {}, rows: [], columns: [] },
  manualData: {
    config: {},
    columns: ['col1', 'col2', 'col3'],
    rows: [],
  },
  selectMap: { config: { mappings: [] } },
  filter: { config: { combinator: 'AND', conditions: [] } },
  transform: { config: { fieldTransforms: [] } },
  deduplicate: { config: { fields: [], strategy: 'first' } },
  preview: { config: {} },
  csvExport: { config: { filename: 'export.csv', delimiter: ',' } },
  dataverseOutput: { config: { entity: '', fieldMappings: [] } },
};

const initial = {
  projectName: 'Untitled pipeline',
  nodes: [],
  edges: [],
  selectedNodeId: null,
  configPanelOpen: false,
  running: false,
  nodeStatus: {},
  // Pointer-drag state (replaces HTML5 DnD)
  drag: null, // { type, ghostX, ghostY } while dragging; null when idle
};

export const usePipelineStore = create((set, get) => ({
  ...initial,

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

  deleteNode: (id) =>
    set({
      nodes: get().nodes.filter((n) => n.id !== id),
      edges: get().edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: get().selectedNodeId === id ? null : get().selectedNodeId,
      configPanelOpen: get().selectedNodeId === id ? false : get().configPanelOpen,
    }),

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
      set({ projectName, nodes: nodes || [], edges: edges || [], nodeStatus: {} });
      return true;
    } catch {
      return false;
    }
  },
}));

function snap(p) {
  const grid = 20;
  return { x: Math.round(p.x / grid) * grid, y: Math.round(p.y / grid) * grid };
}

function prettyName(type) {
  return (
    {
      csvInput: 'CSV Input',
      manualData: 'Manual Data',
      selectMap: 'Select / Map',
      filter: 'Filter',
      transform: 'Transform',
      deduplicate: 'Deduplicate',
      preview: 'Preview',
      csvExport: 'CSV Export',
      dataverseOutput: 'Dataverse Output',
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
