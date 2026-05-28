import React, { useState, useEffect, useRef } from 'react';
import { X, Loader2, AlertCircle, Trash2, ExternalLink, Copy, CheckCircle2, LogIn, User } from 'lucide-react';
import { fetchConnections, fetchServerConfig, startConnectionSignIn, startInteractiveSignIn, pollConnectionSignIn, deleteConnection, activateConnection } from '../lib/api';

// Dataverse org hostnames look like `org.crm.dynamics.com` / `.crm4.` etc.
const ORG_HOST_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;
function normalizeOrgUrl(input) {
  // Accept "https://org.crm.dynamics.com/", "org.crm.dynamics.com", etc.
  let s = String(input || '').trim();
  if (!s) return '';
  s = s.replace(/^https?:\/\//i, '').replace(/\/+$/, '').split('/')[0];
  return s.toLowerCase();
}

export default function SettingsModal({ onClose }) {
  const [connections, setConnections] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [defaultOrgUrl, setDefaultOrgUrl] = useState('');
  const [defaultClientId, setDefaultClientId] = useState('');
  const [defaultTenantId, setDefaultTenantId] = useState('');

  // Sign-in flow state. `prompt` collects the org URL when one isn't configured
  // server-side (or the user wants to use a different env).
  // Stages: null | 'prompt' | 'loading' | 'interactive' | 'code' | 'done' | 'error'
  const [signInStage, setSignInStage] = useState(null);
  const [orgUrlInput, setOrgUrlInput] = useState('');
  const [orgUrlError, setOrgUrlError] = useState(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [clientIdInput, setClientIdInput] = useState('');
  const [tenantIdInput, setTenantIdInput] = useState('');
  const [codeInfo, setCodeInfo] = useState(null);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef(null);

  const load = async () => {
    try {
      const [data, cfg] = await Promise.all([fetchConnections(), fetchServerConfig().catch(() => ({}))]);
      setConnections(data.connections);
      setActiveId(data.activeId);
      setDefaultOrgUrl(cfg.defaultOrgUrl || '');
      setDefaultClientId(cfg.defaultClientId || '');
      setDefaultTenantId(cfg.defaultTenantId || '');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const onStartSignIn = () => {
    // Always open the prompt; pre-fill with the env default when there is one.
    setOrgUrlInput(defaultOrgUrl || '');
    setClientIdInput(defaultClientId || '');
    setTenantIdInput(defaultTenantId || '');
    setAdvancedOpen(false);
    setOrgUrlError(null);
    setError(null);
    setCopied(false);
    setSignInStage('prompt');
  };

  // Shared validation helper
  const validateOrg = () => {
    const org = normalizeOrgUrl(orgUrlInput);
    if (!org) { setOrgUrlError('Enter your Dataverse environment URL.'); return null; }
    if (!ORG_HOST_RE.test(org) || !/\.dynamics\.com$/i.test(org)) {
      setOrgUrlError('Must be a Dataverse host like yourorg.crm.dynamics.com');
      return null;
    }
    setOrgUrlError(null);
    return org;
  };

  // Shared polling starter — used by both flows after their own setup
  const startPolling = () => {
    pollRef.current = setInterval(async () => {
      try {
        const s = await pollConnectionSignIn();
        if (s.status === 'authenticated') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setSignInStage('done');
          setTimeout(async () => { setSignInStage(null); await load(); }, 1200);
        } else if (s.status === 'error') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setError(s.error || 'Sign-in failed');
          setSignInStage('error');
        }
      } catch { /* network hiccup — keep polling */ }
    }, 2000);
  };

  // Primary: interactive browser sign-in (auth code + PKCE)
  const onSubmitOrgUrl = async (e) => {
    e?.preventDefault?.();
    const org = validateOrg();
    if (!org) return;
    setSignInStage('loading');
    try {
      const { authUrl } = await startInteractiveSignIn(org, {
        clientId: clientIdInput.trim(),
        tenantId: tenantIdInput.trim(),
      });
      window.open(authUrl, '_blank', 'noopener,noreferrer');
      setSignInStage('interactive');
      startPolling();
    } catch (e) {
      setError(e.message);
      setSignInStage('error');
    }
  };

  // Fallback: device code flow
  const onSubmitDeviceCode = async () => {
    const org = validateOrg();
    if (!org) return;
    setSignInStage('loading');
    try {
      const info = await startConnectionSignIn(org, {
        clientId: clientIdInput.trim(),
        tenantId: tenantIdInput.trim(),
      });
      setCodeInfo(info);
      setSignInStage('code');
      startPolling();
    } catch (e) {
      setError(e.message);
      setSignInStage('error');
    }
  };

  const cancelSignIn = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setSignInStage(null);
    setCodeInfo(null);
    setError(null);
    setOrgUrlError(null);
  };

  const copyCode = () => {
    navigator.clipboard.writeText(codeInfo?.userCode || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const onDelete = async (id) => {
    if (!confirm('Remove this connection?')) return;
    setError(null);
    try {
      await deleteConnection(id);
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const onActivate = async (id) => {
    setError(null);
    try {
      await activateConnection(id);
      setActiveId(id);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-[#1e2130] border border-slate-700 rounded-xl w-[480px] shadow-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-800 shrink-0">
          <div className="font-semibold text-slate-100 text-base">Connections</div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100 p-1 rounded hover:bg-slate-800 transition"
          >
            <X size={15} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          {loading && (
            <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          )}

          {/* Connection list */}
          {!loading && connections.length === 0 && !signInStage && (
            <div className="text-center py-8 space-y-4">
              <div className="text-slate-500 text-sm">No Microsoft accounts connected.</div>
              <button
                onClick={onStartSignIn}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium transition"
              >
                <LogIn size={15} />
                Sign in with Microsoft
              </button>
            </div>
          )}

          {!loading && connections.map((conn) => (
            <div
              key={conn.id}
              onClick={() => onActivate(conn.id)}
              title={conn.id === activeId ? 'Active connection' : 'Set as active'}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition group cursor-pointer ${
                conn.id === activeId
                  ? 'border-emerald-700/60 bg-emerald-900/20'
                  : 'border-slate-700/60 bg-slate-800/30 hover:bg-slate-800/60'
              }`}
            >
              {/* Radio indicator */}
              <div className="shrink-0">
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition ${
                  conn.id === activeId
                    ? 'border-emerald-400'
                    : 'border-slate-600 group-hover:border-slate-400'
                }`}>
                  {conn.id === activeId && (
                    <div className="w-2 h-2 rounded-full bg-emerald-400" />
                  )}
                </div>
              </div>

              <User size={14} className={conn.id === activeId ? 'text-emerald-400' : 'text-slate-500'} />

              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-200 truncate">{conn.name}</div>
                <div className="text-[10px] text-slate-500 truncate mt-0.5">{conn.username}</div>
                {conn.orgUrl && (
                  <div className="text-[10px] text-slate-500 truncate mt-0.5">{conn.orgUrl}</div>
                )}
              </div>

              <button
                onClick={(e) => { e.stopPropagation(); onDelete(conn.id); }}
                className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-rose-400 transition opacity-0 group-hover:opacity-100 shrink-0"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}

          {/* Prompt for org URL before kicking off the device-code flow */}
          {signInStage === 'prompt' && (
            <form
              onSubmit={onSubmitOrgUrl}
              className="border border-slate-700/60 rounded-lg p-5 space-y-3"
            >
              <label className="block text-sm text-slate-300">
                Dataverse environment URL
                <input
                  type="text"
                  value={orgUrlInput}
                  onChange={(e) => setOrgUrlInput(e.target.value)}
                  placeholder="yourorg.crm.dynamics.com"
                  autoFocus
                  className="mt-2 w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-600"
                />
              </label>
              {!defaultOrgUrl && (
                <p className="text-[11px] text-slate-500">
                  No <code className="text-slate-400">ORG_URL</code> is configured on the server — enter the environment you want to sign in to.
                </p>
              )}

              {/* Advanced: override the Azure AD app registration this sign-in
                  uses. Defaults to the public Azure CLI client + multi-tenant
                  authority so no app registration is required. */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setAdvancedOpen((v) => !v)}
                  className="text-[11px] text-slate-500 hover:text-slate-300 transition"
                >
                  {advancedOpen ? '▾' : '▸'} Advanced — app registration
                </button>
                {advancedOpen && (
                  <div className="mt-2 space-y-3 border border-slate-800 rounded-md p-3 bg-slate-900/40">
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      By default, sign-in uses the public <span className="text-slate-300">Microsoft Azure CLI</span> client against the <code className="text-slate-400">organizations</code> authority — no Azure AD app registration is needed. Override only if you want to use your own app.
                    </p>
                    <label className="block text-xs text-slate-400">
                      Client ID (optional)
                      <input
                        type="text"
                        value={clientIdInput}
                        onChange={(e) => setClientIdInput(e.target.value)}
                        placeholder={defaultClientId || 'leave blank to use the public client'}
                        className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-1.5 text-xs font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-600"
                      />
                    </label>
                    <label className="block text-xs text-slate-400">
                      Tenant ID (optional)
                      <input
                        type="text"
                        value={tenantIdInput}
                        onChange={(e) => setTenantIdInput(e.target.value)}
                        placeholder={defaultTenantId || 'organizations'}
                        className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-1.5 text-xs font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-600"
                      />
                    </label>
                  </div>
                )}
              </div>

              {orgUrlError && (
                <div className="flex items-start gap-2 text-rose-400 text-xs">
                  <AlertCircle size={12} className="shrink-0 mt-0.5" />
                  {orgUrlError}
                </div>
              )}
              <div className="flex items-center justify-between gap-2 pt-1">
                {/* Device code fallback — for environments where browser pop-ups are blocked */}
                <button
                  type="button"
                  onClick={onSubmitDeviceCode}
                  className="text-xs text-slate-500 hover:text-slate-300 transition underline underline-offset-2"
                >
                  Use device code instead
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={cancelSignIn}
                    className="text-xs text-slate-500 hover:text-slate-300 transition px-3 py-1.5"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium transition"
                  >
                    <ExternalLink size={13} />
                    Sign in with Browser
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Sign-in flow (inline) */}
          {signInStage === 'loading' && (
            <div className="border border-slate-700/60 rounded-lg p-5">
              <div className="flex items-center gap-3 text-slate-400">
                <Loader2 size={16} className="animate-spin shrink-0" />
                <span className="text-sm">Requesting sign-in code…</span>
              </div>
            </div>
          )}

          {signInStage === 'interactive' && (
            <div className="border border-sky-700/40 bg-sky-900/10 rounded-lg p-5 space-y-3">
              <p className="text-sm text-slate-300 leading-relaxed">
                A browser tab has opened for sign-in. Complete the sign-in there and this panel will update automatically.
              </p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-500 text-xs">
                  <Loader2 size={11} className="animate-spin shrink-0" />
                  Waiting for browser sign-in…
                </div>
                <button
                  onClick={cancelSignIn}
                  className="text-xs text-slate-500 hover:text-slate-300 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {signInStage === 'code' && codeInfo && (
            <div className="border border-sky-700/40 bg-sky-900/10 rounded-lg p-5 space-y-4">
              <p className="text-sm text-slate-300 leading-relaxed">
                Open the link below and enter the code to sign in with your Microsoft account.
              </p>

              <a
                href={codeInfo.verificationUri}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 text-emerald-400 hover:text-emerald-300 text-sm font-medium transition"
              >
                <ExternalLink size={13} />
                {codeInfo.verificationUri}
              </a>

              <div className="flex items-center gap-3">
                <div className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-center font-mono text-2xl font-bold tracking-[0.35em] text-white select-all">
                  {codeInfo.userCode}
                </div>
                <button
                  onClick={copyCode}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition shrink-0"
                >
                  {copied
                    ? <CheckCircle2 size={13} className="text-emerald-400" />
                    : <Copy size={13} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-500 text-xs">
                  <Loader2 size={11} className="animate-spin shrink-0" />
                  Waiting for sign-in…
                </div>
                <button
                  onClick={cancelSignIn}
                  className="text-xs text-slate-500 hover:text-slate-300 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {signInStage === 'done' && (
            <div className="border border-emerald-700/40 bg-emerald-900/10 rounded-lg p-5">
              <div className="flex items-center gap-3 text-emerald-400">
                <CheckCircle2 size={18} className="shrink-0" />
                <span className="text-sm font-medium">Signed in successfully!</span>
              </div>
            </div>
          )}

          {signInStage === 'error' && (
            <div className="border border-rose-700/40 bg-rose-900/10 rounded-lg p-5 space-y-3">
              <div className="flex items-start gap-2 text-rose-400">
                <AlertCircle size={15} className="shrink-0 mt-0.5" />
                <p className="text-sm">{error || 'Sign-in failed.'}</p>
              </div>
              <button
                onClick={() => { setSignInStage(null); setError(null); }}
                className="text-xs text-slate-400 hover:text-slate-200 transition"
              >
                Dismiss
              </button>
            </div>
          )}

          {!signInStage && error && (
            <div className="flex items-start gap-2 text-rose-400 text-xs">
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 pb-5 pt-2 border-t border-slate-800 shrink-0">
          {!signInStage && connections.length > 0 && (
            <>
              <button
                onClick={onStartSignIn}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-sm font-medium transition"
              >
                <LogIn size={13} />
                Add Account
              </button>
              <button
                onClick={onClose}
                className="px-5 py-1.5 rounded-md bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium transition"
              >
                OK
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
