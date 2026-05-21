import React, { useState, useEffect } from 'react';
import { X, Save, Loader2, CheckCircle2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { fetchSettings, saveSettings } from '../lib/api';

const FIELDS = [
  {
    key: 'TENANT_ID',
    label: 'Tenant ID',
    placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    required: true,
    hint: 'Azure AD tenant. Required for both OAuth and app-token auth.',
  },
  {
    key: 'CLIENT_ID',
    label: 'Client (App) ID',
    placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    required: true,
    hint: 'Azure AD app registration. Required for both OAuth and app-token auth.',
  },
  {
    key: 'CLIENT_SECRET',
    label: 'Client Secret',
    placeholder: 'Leave blank to keep existing value',
    secret: true,
    hint: 'Only needed for app-token (daemon) auth. Not required if you sign in via OAuth.',
  },
  {
    key: 'ORG_URL',
    label: 'Default Environment URL',
    placeholder: 'yourorg.crm.dynamics.com',
    hint: 'Fallback when no per-node URL is set. Required to start OAuth sign-in.',
  },
];

export default function SettingsModal({ onClose }) {
  const [values, setValues]     = useState({ TENANT_ID: '', CLIENT_ID: '', CLIENT_SECRET: '', ORG_URL: '' });
  const [hasSecret, setHasSecret] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [error, setError]       = useState(null);

  useEffect(() => {
    fetchSettings()
      .then((data) => {
        setHasSecret(data._hasSecret || false);
        setValues({
          TENANT_ID:     data.TENANT_ID     || '',
          CLIENT_ID:     data.CLIENT_ID     || '',
          CLIENT_SECRET: '',  // never pre-fill — server sends '***'
          ORG_URL:       data.ORG_URL       || '',
        });
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const set = (key, val) => setValues((prev) => ({ ...prev, [key]: val }));

  const onSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await saveSettings(values);
      setSaved(true);
      if (values.CLIENT_SECRET) setHasSecret(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-[#1e2130] border border-slate-700 rounded-xl w-[500px] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-800">
          <div className="font-semibold text-slate-100 text-base">Environment Settings</div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100 p-1 rounded hover:bg-slate-800 transition"
          >
            <X size={15} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* OAuth note */}
          <div className="bg-slate-800/60 border border-slate-700 rounded-lg px-4 py-3 text-[11px] text-slate-400 leading-relaxed">
            <span className="text-emerald-400 font-semibold">Tip:</span> If you sign in via OAuth (Sign in button), the Client Secret is not required — your delegated user token is used instead. Tenant ID, Client ID, and Environment URL are always needed.
          </div>

          {loading && (
            <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          )}

          {!loading && FIELDS.map(({ key, label, placeholder, secret, required, hint }) => (
            <div key={key}>
              <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">
                {label}
                {required && <span className="ml-1 text-rose-400">*</span>}
              </label>
              <div className="relative">
                <input
                  type={secret && !showSecret ? 'password' : 'text'}
                  value={values[key]}
                  onChange={(e) => set(key, e.target.value)}
                  placeholder={secret && hasSecret && !values[key] ? '(secret saved — leave blank to keep)' : placeholder}
                  className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 hover:border-slate-500 focus:border-sky-500 text-slate-200 outline-none transition font-mono text-[11px] pr-9"
                />
                {secret && (
                  <button
                    type="button"
                    onClick={() => setShowSecret((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition"
                  >
                    {showSecret ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                )}
              </div>
              {hint && <p className="text-[10px] text-slate-600 mt-1">{hint}</p>}
            </div>
          ))}

          {error && (
            <div className="flex items-start gap-2 text-rose-400 text-xs">
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 pb-5">
          <p className="text-[10px] text-slate-600">Changes are written to the root <code className="text-slate-500">.env</code> file immediately.</p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition"
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              disabled={saving || loading}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium disabled:opacity-50 transition"
            >
              {saving ? (
                <Loader2 size={13} className="animate-spin" />
              ) : saved ? (
                <CheckCircle2 size={13} className="text-emerald-300" />
              ) : (
                <Save size={13} />
              )}
              {saving ? 'Saving…' : saved ? 'Saved!' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
