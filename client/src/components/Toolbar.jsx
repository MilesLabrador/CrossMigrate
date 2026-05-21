import React, { useState, useEffect } from 'react';
import { Save, FolderOpen, Play, Trash2, Loader2, CheckCircle2, AlertCircle, AlertTriangle, LogIn, LogOut, User } from 'lucide-react';
import { usePipelineStore } from '../store/usePipelineStore';
import { runPipelineStream, fetchDataverseRows } from '../lib/api';
import SignInModal from './SignInModal';

const SOURCE_TYPES = new Set(['csvInput', 'manualData', 'dataverseInput']);

export default function Toolbar() {
  const {
    projectName, setProjectName,
    save, load, clearCanvas,
    nodes, edges,
    setRunning, running,
    setNodeStatus, resetNodeStatuses,
    updateNodeData,
  } = usePipelineStore();

  const [savedFlash, setSavedFlash] = useState(false);
  const [runBanner, setRunBanner] = useState(null); // { kind, message }
  const [authUser, setAuthUser]   = useState(null); // { name, username } | null
  const [showSignIn, setShowSignIn] = useState(false);

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

  const onSave = () => {
    save();
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1200);
  };

  const onRun = async () => {
    if (!nodes.length || running) return;

    setRunning(true);
    resetNodeStatuses();

    // ── Auto-fetch unconfigured check ─────────────────────────────────────────
    const unconfigured = nodes.filter(
      (n) => n.type === 'dataverseInput' && !n.data?.config?.entity
    );
    if (unconfigured.length) {
      showBanner('warn', `${unconfigured.map((n) => n.data?.name).join(', ')} has no entity configured — open its config panel first`);
      setRunning(false);
      return;
    }

    // ── Auto-fetch unfetched dataverseInput nodes ─────────────────────────────
    const unfetched = nodes.filter(
      (n) => n.type === 'dataverseInput' && n.data?.config?.entity && !(n.data?.rows?.length)
    );
    if (unfetched.length) {
      showBanner('ok', `Auto-fetching ${unfetched.length} Dataverse source${unfetched.length > 1 ? 's' : ''}…`, 0);
      for (const n of unfetched) {
        try {
          const cfg = n.data.config;
          const result = await fetchDataverseRows({
            entity:  cfg.entity,
            select:  cfg.select  || '',
            filter:  cfg.filter  || '',
            top:     cfg.top     || 5000,
            orgUrl:  cfg.orgUrl  || '',
          });
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
          <Btn onClick={onSave} icon={<Save size={14} />}>{savedFlash ? 'Saved!' : 'Save'}</Btn>
          <Btn onClick={() => load()} icon={<FolderOpen size={14} />}>Load</Btn>
          <Btn onClick={() => { if (confirm('Clear the entire canvas?')) clearCanvas(); }} icon={<Trash2 size={14} />}>Clear</Btn>

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
