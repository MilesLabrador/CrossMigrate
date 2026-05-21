import React, { useState, useEffect, useRef } from 'react';
import { ExternalLink, Copy, CheckCircle2, Loader2, X, AlertCircle } from 'lucide-react';

export default function SignInModal({ onClose, onAuthenticated, orgUrl = '' }) {
  const [stage, setStage]       = useState('loading'); // loading | code | done | error
  const [codeInfo, setCodeInfo] = useState(null);
  const [copied, setCopied]     = useState(false);
  const [error, setError]       = useState(null);
  const pollRef                  = useRef(null);

  useEffect(() => {
    fetch('/api/auth/start', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ orgUrl }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setCodeInfo(data);
        setStage('code');

        // Poll every 2 s for completion
        pollRef.current = setInterval(async () => {
          try {
            const r = await fetch('/api/auth/status');
            const s = await r.json();
            if (s.status === 'authenticated') {
              clearInterval(pollRef.current);
              setStage('done');
              setTimeout(() => onAuthenticated(s.user), 700);
            } else if (s.status === 'error') {
              clearInterval(pollRef.current);
              setError(s.error || 'Sign-in failed');
              setStage('error');
            }
          } catch { /* network hiccup — keep polling */ }
        }, 2000);
      })
      .catch((err) => {
        setError(err.message);
        setStage('error');
      });

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const copyCode = () => {
    navigator.clipboard.writeText(codeInfo?.userCode || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-[#1e2130] border border-slate-700 rounded-xl w-[440px] p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="font-semibold text-slate-100 text-base">Sign in with Microsoft</div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100 p-1 rounded hover:bg-slate-800 transition"
          >
            <X size={15} />
          </button>
        </div>

        {/* Loading */}
        {stage === 'loading' && (
          <div className="flex items-center gap-3 text-slate-400 py-6">
            <Loader2 size={16} className="animate-spin shrink-0" />
            <span className="text-sm">Requesting sign-in code…</span>
          </div>
        )}

        {/* Device code */}
        {stage === 'code' && codeInfo && (
          <div className="space-y-4">
            <p className="text-sm text-slate-300 leading-relaxed">
              Open the link below and enter the code to authorize CrossMigrate with your Microsoft account.
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

            <div className="flex items-center gap-2 text-slate-500 text-xs pt-1">
              <Loader2 size={11} className="animate-spin shrink-0" />
              Waiting for you to complete sign-in in your browser…
            </div>
          </div>
        )}

        {/* Success */}
        {stage === 'done' && (
          <div className="flex items-center gap-3 text-emerald-400 py-6">
            <CheckCircle2 size={18} className="shrink-0" />
            <span className="text-sm font-medium">Signed in! Closing…</span>
          </div>
        )}

        {/* Error */}
        {stage === 'error' && (
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-2 text-rose-400">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <p className="text-sm">{error || 'Sign-in failed. Please try again.'}</p>
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm rounded-lg transition"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
