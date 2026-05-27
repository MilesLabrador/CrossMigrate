import * as msal from '@azure/msal-node';
import { InteractionRequiredAuthError } from '@azure/msal-node';
import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));

// ── Defaults ────────────────────────────────────────────────────────────────
// Public client + multi-tenant authority so end users don't have to register
// their own Azure AD app or rely on the operator's app registration. Users
// (or operators) can override per-connection via the sign-in form, or
// globally via CLIENT_ID / TENANT_ID env vars.
//
// 04b07795-8ddb-461a-bbee-02f9e1bf7b46 is the Microsoft Azure CLI public
// client. It is a trusted first-party client and can request delegated
// `user_impersonation` against any Dataverse org the signed-in user has
// access to.
const DEFAULT_CLIENT_ID = '04b07795-8ddb-461a-bbee-02f9e1bf7b46';
const DEFAULT_TENANT_ID = 'organizations';

function effectiveClientId(clientId) {
  return clientId || process.env.CLIENT_ID || DEFAULT_CLIENT_ID;
}
function effectiveTenantId(tenantId) {
  return tenantId || process.env.TENANT_ID || DEFAULT_TENANT_ID;
}

// Only allow Dataverse org hostnames as token scope targets — otherwise a
// caller could request tokens for an arbitrary domain via /api/auth/start.
const ORG_HOST_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;
function assertOrgHost(org) {
  if (!ORG_HOST_RE.test(org) || !/\.dynamics\.com$/i.test(org)) {
    throw new Error(`invalid org host: ${org}`);
  }
}

// ── Per-(clientId, tenantId) PCA cache ──────────────────────────────────────
// Each registration has its own MSAL token cache file. We key PCAs by the
// pair so connections that use different app registrations don't share an
// account list.
const pcaCache = new Map(); // key -> { pca, ready: Promise }
const accountByKey = new Map(); // key -> AccountInfo (last signed-in account for that PCA)

function pcaKey(clientId, tenantId) {
  return `${clientId}|${tenantId}`;
}

function cachePathFor(clientId, tenantId) {
  const safe = `${clientId}_${tenantId}`.replace(/[^a-z0-9_-]/gi, '_');
  const target = path.join(__dirname, '..', `.msal-cache.${safe}.json`);
  // One-shot migration: older builds wrote a single shared cache file. Adopt
  // it as the cache for the env-configured (clientId, tenantId) so a user
  // doesn't lose their existing session after this refactor.
  const legacy = path.join(__dirname, '..', '.msal-cache.json');
  if (
    !fs.existsSync(target) &&
    fs.existsSync(legacy) &&
    clientId === (process.env.CLIENT_ID || DEFAULT_CLIENT_ID) &&
    tenantId === (process.env.TENANT_ID || DEFAULT_TENANT_ID)
  ) {
    try { fs.copyFileSync(legacy, target); }
    catch (err) { console.warn('[msal] legacy cache migration failed:', err.message); }
  }
  return target;
}

function makeCachePlugin(filePath) {
  return {
    beforeCacheAccess: async (ctx) => {
      if (fs.existsSync(filePath)) {
        try { ctx.tokenCache.deserialize(fs.readFileSync(filePath, 'utf8')); }
        catch { /* corrupt cache — start fresh */ }
      }
    },
    afterCacheAccess: async (ctx) => {
      if (ctx.cacheHasChanged) {
        try { fs.writeFileSync(filePath, ctx.tokenCache.serialize()); }
        catch (err) { console.warn('[msal] cache write failed:', err.message); }
      }
    },
  };
}

function getPca(clientId, tenantId) {
  const cid = effectiveClientId(clientId);
  const tid = effectiveTenantId(tenantId);
  const key = pcaKey(cid, tid);
  let entry = pcaCache.get(key);
  if (entry) return entry;

  const pca = new msal.PublicClientApplication({
    auth: {
      clientId:  cid,
      authority: `https://login.microsoftonline.com/${tid}`,
    },
    cache: { cachePlugin: makeCachePlugin(cachePathFor(cid, tid)) },
  });

  const ready = pca.getTokenCache().getAllAccounts()
    .then((accounts) => {
      if (accounts.length > 0 && !accountByKey.has(key)) {
        accountByKey.set(key, accounts[0]);
        // No console.log per-key; restored sessions are reported lazily via getAuthState.
      }
    })
    .catch(() => {});

  entry = { pca, ready };
  pcaCache.set(key, entry);
  return entry;
}

// ── Global "current" pointer ────────────────────────────────────────────────
// The UI surfaces one active session at a time. `currentKey` tracks which
// (clientId, tenantId) is in scope; the account comes from accountByKey.
let currentKey = null;
let authState  = { status: 'idle' }; // idle | pending | authenticated | error

function setCurrent(clientId, tenantId, account) {
  currentKey = pcaKey(effectiveClientId(clientId), effectiveTenantId(tenantId));
  if (account) accountByKey.set(currentKey, account);
  authState = { status: 'authenticated' };
}

export async function getAuthState() {
  // If nothing is current yet but a cached account exists for the default
  // (clientId, tenantId), surface it so the UI doesn't appear signed out
  // after a restart.
  if (!currentKey) {
    const key = pcaKey(effectiveClientId(), effectiveTenantId());
    const entry = getPca();
    await entry.ready;
    if (accountByKey.has(key)) {
      currentKey = key;
      authState = { status: 'authenticated' };
    }
  }
  const account = currentKey ? accountByKey.get(currentKey) : null;
  return {
    status: authState.status,
    error:  authState.error || null,
    user:   account ? { name: account.name, username: account.username } : null,
  };
}

// ── Device-code flow ────────────────────────────────────────────────────────
export async function startDeviceCodeFlow(orgUrl, { clientId, tenantId } = {}) {
  const org = orgUrl || process.env.ORG_URL;
  if (!org) throw new Error('No org URL provided and ORG_URL is not set in .env');
  assertOrgHost(org);

  const cid = effectiveClientId(clientId);
  const tid = effectiveTenantId(tenantId);
  const scopes = [`https://${org}/user_impersonation`];
  authState = { status: 'pending' };

  let resolveDeviceCode;
  const deviceCodeReady = new Promise((res) => { resolveDeviceCode = res; });

  const { pca } = getPca(cid, tid);
  pca.acquireTokenByDeviceCode({
    scopes,
    deviceCodeCallback: (info) => resolveDeviceCode(info),
  })
    .then((result) => {
      if (result) {
        setCurrent(cid, tid, result.account);
        console.log(`[msal] signed in as ${result.account.username} for ${org} (client ${cid})`);
      }
    })
    .catch((err) => {
      authState = { status: 'error', error: err.message };
      console.error('[msal] device code flow failed:', err.message);
    });

  return deviceCodeReady;
}

// ── Silent token acquisition ────────────────────────────────────────────────
// Accepts optional (clientId, tenantId) so per-connection sessions can be
// addressed. Falls back to the current global session when not provided.
export async function getUserToken(orgUrl, { clientId, tenantId } = {}) {
  const org = orgUrl || process.env.ORG_URL;
  if (!org) return null;
  assertOrgHost(org);

  let cid, tid, key;
  if (clientId || tenantId) {
    cid = effectiveClientId(clientId);
    tid = effectiveTenantId(tenantId);
    key = pcaKey(cid, tid);
  } else if (currentKey) {
    key = currentKey;
    [cid, tid] = currentKey.split('|');
  } else {
    return null;
  }

  const { pca, ready } = getPca(cid, tid);
  await ready;
  const account = accountByKey.get(key);
  if (!account) return null;

  try {
    const result = await pca.acquireTokenSilent({
      scopes:  [`https://${org}/user_impersonation`],
      account,
    });
    return result?.accessToken || null;
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) {
      throw new Error(`sign-in-required:${org}`);
    }
    const code = err.errorCode || '';
    if (code === 'invalid_grant' || code === 'token_expired') {
      console.warn('[msal] refresh token invalid, resetting session');
      accountByKey.delete(key);
      if (currentKey === key) {
        currentKey = null;
        authState  = { status: 'idle' };
      }
    } else {
      console.warn(`[msal] silent auth failed for ${org} (${code || err.message}) — keeping session`);
    }
    return null;
  }
}

// ── Reset (e.g. CLIENT_ID / TENANT_ID env changed at runtime) ───────────────
export function resetPca() {
  pcaCache.clear();
  accountByKey.clear();
  currentKey = null;
  authState  = { status: 'idle' };
}

// ── Sign out the active session ─────────────────────────────────────────────
export async function logout() {
  if (currentKey) {
    const account = accountByKey.get(currentKey);
    const entry   = pcaCache.get(currentKey);
    if (account && entry) {
      try { await entry.pca.getTokenCache().removeAccount(account); }
      catch { /* ignore */ }
    }
    accountByKey.delete(currentKey);
    currentKey = null;
  }
  authState = { status: 'idle' };
}
