import React, { useState, useEffect, useRef } from 'react';
import { Save, Play, Trash2, Loader2, CheckCircle2, AlertCircle, AlertTriangle, LogIn, LogOut, User, Settings, Globe, Plus, Pencil, Trash } from 'lucide-react';
import { usePipelineStore } from '../store/usePipelineStore';
import { runPipelineStream, fetchDataverseRows, fetchDataverseView } from '../lib/api';
import SignInModal from './SignInModal';
import SettingsModal from './SettingsModal';

const SOURCE_TYPES = new Set(['csvInput', 'manualData', 'dataverseInput', 'dataverseView']);

export default function Toolbar() {
  const {
    projectName, setProjectName,
    save, clearCanvas,
    nodes, edges,
    setRunning, running,
    setNodeStatus, resetNodeStatuses,
    updateNodeData,
    environments, activeEnvId, setActiveEnv, addEnvironment, updateEnvironment, removeEnvironment,
  } = usePipelineStore();

  const [savedFlash, setSavedFlash] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [runBanner, setRunBanner] = useState(null); // { kind, message }
  const [authUser, setAuthUser]   = useState(null); // { name, username } | null
  const [showSignIn, setShowSignIn] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showEnvMenu, setShowEnvMenu] = useState(false);
  const [envEdit, setEnvEdit] = useState(null); // { id?, name, orgUrl } — null = closed
  const envMenuRef = useRef(null);

  // Check auth state on mount
  useEffect(() => {
    fetch('/api/auth/status')
      .then((r) => r.json())
      .then((s) => { if (s.status === 'authenticated') setAuthUser(s.user); })
      .catch(() => {});
  }, []);

  const onSignOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setAuthUser(null);
  };

  const showBanner = (kind, message, ttl = 6000) => {
    setRunBanner({ kind, message });
    if (ttl > 0) setTimeout(() => setRunBanner(null), ttl);
  };

  // Close env menu on outside click
  useEffect(() => {
    if (!showEnvMenu) return;
    const handler = (e) => {
      if (envMenuRef.current && !envMenuRef.current.contains(e.target)) setShowEnvMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showEnvMenu]);

  const activeEnv = environments.find((e) => e.id === activeEnvId);

  const onSave = () => {
    save();
    setSavedFlash(true);
    setSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    setTimeout(() => setSavedFlash(false), 1200);
  };

  const onSaveEnv = () => {
    if (!envEdit) return;
    const name = envEdit.name.trim();
    const orgUrl = envEdit.orgUrl.trim();
    if (!name || !orgUrl) return;
    if (envEdit.id) {
      updateEnvironment(envEdit.id, { name, orgUrl });
    } else {
      addEnvironment(name, orgUrl);
    }
    setEnvEdit(null);
  };

  const onRun = async () => {
    if (!nodes.length || running) return;

    setRunning(true);
    resetNodeStatuses();

    // ── Auto-fetch unconfigured check ─────────────────────────────────────────
    const unconfigured = nodes.filter(
      (n) =>
        (n.type === 'dataverseInput' && !n.data?.config?.entity) ||
        (n.type === 'dataverseView'  && (!n.data?.config?.entity || !n.data?.config?.fetchXml))
    );
    if (unconfigured.length) {
      showBanner('warn', `${unconfigured.map((n) => n.data?.name).join(', ')} has no entity/view configured — open its config panel first`);
      setRunning(false);
      return;
    }

    // ── Auto-fetch unfetched Dataverse source nodes ───────────────────────────
    const unfetched = nodes.filter(
      (n) =>
        (n.type === 'dataverseInput' && n.data?.config?.entity   && !(n.data?.rows?.length)) ||
        (n.type === 'dataverseView'  && n.data?.config?.fetchXml && !(n.data?.rows?.length))
    );
    if (unfetched.length) {
      showBanner('ok', `Auto-fetching ${unfetched.length} Dataverse source${unfetched.length > 1 ? 's' : ''}…`, 0);
      for (const n of unfetched) {
        try {
          const cfg = n.data.config;
          let result;
          if (n.type === 'dataverseView') {
            result = await fetchDataverseView({
              entityCollection: cfg.entity,
              savedQueryId:     cfg.viewId,
              orgUrl:           cfg.orgUrl || '',
              viewColumns:      cfg.viewColumns || [],
            });
          } else {
            result = await fetchDataverseRows({
              entity:  cfg.entity,
              select:  cfg.select  || '',
              filter:  cfg.filter  || '',
              top:     cfg.top     || 5000,
              orgUrl:  cfg.orgUrl  || '',
            });
          }
          updateNodeData(n.id, {
            rows:         result.rows,
            columns:      result.columns,
            _lastFetched: new Date().toLocaleTimeString(),
            _zeroRows:    result.rowCount === 0,
            _debugUrl:    result._debugUrl || null,
          });
        } catch (err) {
          showBanner('error', `Auto-fetch failed for "${n.data?.name}": ${err.message}`);
          setRunning(false);
          return;
        }
      }
      setRunBanner(null);
    }

    // ── Block if other source nodes are still empty ───────────────────────────
    const latestNodes = usePipelineStore.getState().nodes;
    const emptySources = latestNodes.filter(
      (n) => SOURCE_TYPES.has(n.type) && !(n.data?.rows?.length)
    );
    if (emptySources.length) {
      showBanner('warn', `${emptySources.map((n) => n.data?.name || n.type).join(', ')} has 0 rows — load data first`);
      setRunning(false);
      return;
    }

    // ── Build slim payload from latest store state ────────────────────────────
    const latestEdges = usePipelineStore.getState().edges;
    const slim = {
      nodes: latestNodes.map((n) => ({
        id: n.id, type: n.type, position: n.position,
        data: { name: n.data?.name, config: n.data?.config, rows: n.data?.rows, columns: n.data?.columns },
      })),
      edges: latestEdges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
    };

    let lastRowCount = 0;
    let errorCount   = 0;

    try {
      await runPipelineStream(slim, (evt) => {
        if (evt.type === 'node') {
          setNodeStatus(evt.nodeId, evt);
          if (evt.status === 'success') {
            lastRowCount = evt.rowCount ?? 0;
            if (Array.isArray(evt.rows)) updateNodeData(evt.nodeId, { _producedRows: evt.rows });
          }
          if (evt.status === 'error') errorCount++;
        }
      });

      if (errorCount > 0) {
        showBanner('error', `Pipeline finished with ${errorCount} node error${errorCount > 1 ? 's' : ''} — check highlighted nodes`);
      } else {
        showBanner('ok', `Pipeline complete · ${lastRowCount.toLocaleString()} rows out`);
      }
    } catch (err) {
      console.error('pipeline run failed', err);
      showBanner('error', `Pipeline failed: ${err.message}`);
    } finally {
      setRunning(false);
    }
  };

  const bannerColors = {
    ok:    'bg-emerald-900/80 border-emerald-700 text-emerald-200',
    warn:  'bg-amber-900/80 border-amber-700 text-amber-200',
    error: 'bg-rose-900/80 border-rose-700 text-rose-200',
  };
  const BannerIcon = { ok: CheckCircle2, warn: AlertTriangle, error: AlertCircle };

  return (
    <>
      <div className="h-14 flex items-center justify-between px-4 bg-card border-b border-slate-800 z-30 relative shrink-0">
        <div className="flex items-center gap-3">
          <div className="font-bold text-lg tracking-tight text-white">
            Cross<span className="text-emerald-400">Migrate</span>
          </div>
          <input
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            className="bg-transparent text-slate-300 text-sm px-2 py-1 rounded hover:bg-slate-800 focus:bg-slate-800 outline-none w-64"
          />
        </div>
        <div className="flex items-center gap-2">
          {/* Save with timestamp tooltip */}
          <button
            onClick={onSave}
            title={savedAt ? `Last saved at ${savedAt}` : 'Save pipeline (Ctrl+S)'}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm transition"
          >
            {savedFlash ? <CheckCircle2 size={14} className="text-emerald-400" /> : <Save size={14} />}
            {savedFlash ? 'Saved!' : savedAt ? `Saved ${savedAt}` : 'Save'}
          </button>
          <Btn onClick={() => { if (confirm('Clear the entire canvas?')) clearCanvas(); }} icon={<Trash2 size={14} />}>Clear</Btn>
          <Btn onClick={() => setShowSettings(true)} icon={<Settings size={14} />}>Settings</Btn>

          {/* Environment selector */}
          <div className="relative" ref={envMenuRef}>
            <button
              onClick={() => setShowEnvMenu((v) => !v)}
              title="Switch environment"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm transition"
            >
              <Globe size={14} className={activeEnv ? 'text-emerald-400' : 'text-slate-500'} />
              <span className="max-w-[100px] truncate">{activeEnv?.name || 'Environment'}</span>
            </button>
            {showEnvMenu && (
              <div className="absolute right-0 top-full mt-1 w-72 bg-[#1e2130] border border-slate-700 rounded-xl shadow-2xl z-50 p-2 space-y-1">
                {environments.length === 0 && (
                  <div className="text-[11px] text-slate-500 px-2 py-1.5">No environments yet</div>
                )}
                {environments.map((env) => (
                  <div
                    key={env.id}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer group ${env.id === activeEnvId ? 'bg-emerald-900/40 text-emerald-300' : 'text-slate-300 hover:bg-slate-800'}`}
                    onClick={() => { setActiveEnv(env.id); setShowEnvMenu(false); }}
                  >
                    <Globe size={12} className={env.id === activeEnvId ? 'text-emerald-400' : 'text-slate-500'} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{env.name}</div>
                      <div className="text-[10px] text-slate-600 truncate font-mono">{env.orgUrl}</div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button
                        onClick={(e) => { e.stopPropagation(); setEnvEdit({ id: env.id, name: env.name, orgUrl: env.orgUrl }); setShowEnvMenu(false); }}
                        className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200"
                      ><Pencil size={11} /></button>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeEnvironment(env.id); }}
                        className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-rose-400"
                      ><Trash size={11} /></button>
                    </div>
                  </div>
                ))}
                <div className="border-t border-slate-800 pt-1 mt-1">
                  <button
                    onClick={() => { setEnvEdit({ name: '', orgUrl: '' }); setShowEnvMenu(false); }}
                    className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-lg text-[11px] text-sky-400 hover:bg-slate-800 transition"
                  >
                    <Plus size={11} /> Add environment
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Auth */}
          <div className="w-px h-5 bg-slate-700 mx-1" />
          {authUser ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-slate-300 bg-slate-800 px-2.5 py-1.5 rounded-md">
                <User size={12} className="text-emerald-400" />
                <span className="max-w-[140px] truncate">{authUser.name || authUser.username}</span>
              </div>
              <Btn onClick={onSignOut} icon={<LogOut size={14} />}>Sign out</Btn>
            </div>
          ) : (
            <Btn onClick={() => setShowSignIn(true)} icon={<LogIn size={14} />}>Sign in</Btn>
          )}

          <div className="w-px h-5 bg-slate-700 mx-1" />
          <button
            onClick={onRun}
            disabled={running || !nodes.length}
            className="flex items-center gap-2 px-4 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            {running ? 'Running…' : 'Run'}
          </button>
        </div>
      </div>

      {runBanner && (() => {
        const Icon = BannerIcon[runBanner.kind];
        return (
          <div className={`flex items-center gap-2 px-4 py-2 text-sm border-b z-20 relative shrink-0 ${bannerColors[runBanner.kind]}`}>
            <Icon size={14} className="shrink-0" />
            {runBanner.message}
            <button onClick={() => setRunBanner(null)} className="ml-auto opacity-60 hover:opacity-100 text-xs">✕</button>
          </div>
        );
      })()}

      {showSignIn && (
        <SignInModal
          onClose={() => setShowSignIn(false)}
          onAuthenticated={(user) => {
            setAuthUser(user);
            setShowSignIn(false);
          }}
        />
      )}

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

      {/* Environment add/edit modal */}
      {envEdit !== null && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-[#1e2130] border border-slate-700 rounded-xl w-[380px] shadow-2xl p-6 space-y-4">
            <div className="font-semibold text-slate-100">{envEdit.id ? 'Edit Environment' : 'Add Environment'}</div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">Name</label>
              <input
                autoFocus
                value={envEdit.name}
                onChange={(e) => setEnvEdit((v) => ({ ...v, name: e.target.value }))}
                placeholder="Production"
                className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 hover:border-slate-500 focus:border-sky-500 text-slate-200 outline-none transition text-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">Environment URL</label>
              <input
                value={envEdit.orgUrl}
                onChange={(e) => setEnvEdit((v) => ({ ...v, orgUrl: e.target.value }))}
                placeholder="yourorg.crm.dynamics.com"
                className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 hover:border-slate-500 focus:border-sky-500 text-slate-200 outline-none transition text-sm font-mono"
                onKeyDown={(e) => { if (e.key === 'Enter') onSaveEnv(); if (e.key === 'Escape') setEnvEdit(null); }}
              />
              <p className="text-[10px] text-slate-600 mt-1">Just the hostname — e.g. yourorg.crm.dynamics.com</p>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setEnvEdit(null)} className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition">Cancel</button>
              <button
                onClick={onSaveEnv}
                disabled={!envEdit.name.trim() || !envEdit.orgUrl.trim()}
                className="px-4 py-1.5 rounded-md bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-sm font-medium transition"
              >{envEdit.id ? 'Update' : 'Add'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Btn({ children, onClick, icon }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm transition">
      {icon}{children}
    </button>
  );
}
