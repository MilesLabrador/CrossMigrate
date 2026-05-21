import * as msal from '@azure/msal-node';
import { InteractionRequiredAuthError } from '@azure/msal-node';
import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = path.join(__dirname, '..', '.msal-cache.json');

// ── Persist MSAL token cache to disk so sessions survive server restarts ─────
const cachePlugin = {
  beforeCacheAccess: async (ctx) => {
    if (fs.existsSync(CACHE_PATH)) {
      try { ctx.tokenCache.deserialize(fs.readFileSync(CACHE_PATH, 'utf8')); }
      catch { /* corrupt cache — start fresh */ }
    }
  },
  afterCacheAccess: async (ctx) => {
    if (ctx.cacheHasChanged) {
      try { fs.writeFileSync(CACHE_PATH, ctx.tokenCache.serialize()); }
      catch (err) { console.warn('[msal] cache write failed:', err.message); }
    }
  },
};

// ── Lazy PCA init + account restore promise ───────────────────────────────────
let _pca          = null;
let _readyPromise = null; // resolves once cached accounts are restored

function getPca() {
  if (!_pca) {
    const { CLIENT_ID, TENANT_ID } = process.env;
    if (!CLIENT_ID || !TENANT_ID) {
      throw new Error('CLIENT_ID and TENANT_ID must be set in .env to use Microsoft sign-in');
    }
    _pca = new msal.PublicClientApplication({
      auth: {
        clientId:  CLIENT_ID,
        authority: `https://login.microsoftonline.com/${TENANT_ID}`,
      },
      cache: { cachePlugin },
    });

    // Restore any previously signed-in account from the persisted cache
    _readyPromise = _pca.getTokenCache()
      .getAllAccounts()
      .then((accounts) => {
        if (accounts.length > 0 && !currentAccount) {
          currentAccount = accounts[0];
          authState = { status: 'authenticated' };
          console.log(`[msal] restored session for ${currentAccount.username}`);
        }
      })
      .catch(() => {});
  }
  return _pca;
}

// ── Global auth state ─────────────────────────────────────────────────────────
let authState      = { status: 'idle' }; // idle | pending | authenticated | error
let currentAccount = null;

export async function getAuthState() {
  if (_readyPromise) await _readyPromise; // ensure cache is loaded before reporting
  return {
    status: authState.status,
    error:  authState.error || null,
    user:   currentAccount
      ? { name: currentAccount.name, username: currentAccount.username }
      : null,
  };
}

// ── Device-code flow ──────────────────────────────────────────────────────────
export async function startDeviceCodeFlow(orgUrl) {
  const org = orgUrl || process.env.ORG_URL;
  if (!org) throw new Error('No org URL provided and ORG_URL is not set in .env');

  const scopes = [`https://${org}/user_impersonation`];
  authState     = { status: 'pending' };
  // Don't clear currentAccount here — it might still be valid for other orgs

  let resolveDeviceCode;
  const deviceCodeReady = new Promise((res) => { resolveDeviceCode = res; });

  getPca()
    .acquireTokenByDeviceCode({
      scopes,
      deviceCodeCallback: (info) => resolveDeviceCode(info),
    })
    .then((result) => {
      if (result) {
        currentAccount = result.account;
        authState = { status: 'authenticated' };
        console.log(`[msal] signed in as ${result.account.username} for ${org}`);
      }
    })
    .catch((err) => {
      authState = { status: 'error', error: err.message };
      console.error('[msal] device code flow failed:', err.message);
    });

  return deviceCodeReady;
}

// ── Silent token acquisition (works for any org in the same tenant) ───────────
export async function getUserToken(orgUrl) {
  if (_readyPromise) await _readyPromise; // ensure restore has run

  const org = orgUrl || process.env.ORG_URL;
  if (!org || !currentAccount) return null;

  try {
    const result = await getPca().acquireTokenSilent({
      scopes:  [`https://${org}/user_impersonation`],
      account: currentAccount,
    });
    return result?.accessToken || null;
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) {
      // Explicit consent needed for this org — surface to UI
      throw new Error(`sign-in-required:${org}`);
    }
    // Transient failure (network blip, clock skew, etc.) — don't wipe the
    // session, just return null so the caller can decide what to do.
    // Only reset if MSAL tells us the refresh token is definitively invalid.
    const code = err.errorCode || '';
    if (code === 'invalid_grant' || code === 'token_expired') {
      console.warn('[msal] refresh token invalid, resetting session');
      currentAccount = null;
      authState      = { status: 'idle' };
    } else {
      console.warn(`[msal] silent auth failed for ${org} (${code || err.message}) — keeping session`);
    }
    return null;
  }
}

// ── Reset PCA (call when CLIENT_ID / TENANT_ID changes at runtime) ───────────
export function resetPca() {
  _pca          = null;
  _readyPromise = null;
  currentAccount = null;
  authState      = { status: 'idle' };
}

// ── Sign out ──────────────────────────────────────────────────────────────────
export async function logout() {
  if (currentAccount) {
    try { await getPca().getTokenCache().removeAccount(currentAccount); }
    catch { /* ignore */ }
  }
  currentAccount = null;
  authState      = { status: 'idle' };
}
