import axios from 'axios';
import { getUserToken } from './msalAuth.js';

// Per-org token cache so multiple environments work simultaneously
const tokenCache  = new Map(); // orgUrl -> { token, expiresAt }
const inFlightMap = new Map(); // orgUrl -> Promise<string>

export async function getAccessToken(orgUrl) {
  const org = orgUrl || process.env.ORG_URL;
  if (!org) throw new Error('No ORG_URL configured');

  const { TENANT_ID, CLIENT_ID, CLIENT_SECRET } = process.env;
  if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('Missing TENANT_ID / CLIENT_ID / CLIENT_SECRET in env');
  }

  const now = Date.now();
  const cached = tokenCache.get(org);
  if (cached && now < cached.expiresAt - 60_000) return cached.token;

  const existing = inFlightMap.get(org);
  if (existing) return existing;

  const promise = axios
    .post(
      `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
      new URLSearchParams({
        grant_type:    'client_credentials',
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        scope:         `https://${org}/.default`,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    )
    .then((res) => {
      const token = res.data.access_token;
      tokenCache.set(org, { token, expiresAt: Date.now() + res.data.expires_in * 1000 });
      return token;
    })
    .finally(() => inFlightMap.delete(org));

  inFlightMap.set(org, promise);
  return promise;
}

export function dataverseBaseUrl(orgUrl) {
  const org = orgUrl || process.env.ORG_URL;
  return `https://${org}/api/data/v9.2`;
}

// Axios 1.x uses URLSearchParams which encodes '$' → '%24'.
// Dataverse OData requires literal $top/$select/$filter — use a custom serializer
// that keeps keys verbatim and only encodes values.
function odataParamsSerializer(params) {
  return Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
}

export async function dvRequest({ method = 'GET', path, data, params, headers = {}, orgUrl } = {}) {
  // Prefer delegated user token; fall back to client-credential app token.
  // If the user is signed in but this org needs explicit consent, surface it clearly.
  let token;
  try {
    token = await getUserToken(orgUrl);
  } catch (err) {
    throw err; // propagate sign-in-required errors
  }
  if (!token) {
    token = await getAccessToken(orgUrl);
  }
  const base  = dataverseBaseUrl(orgUrl);
  const url   = path.startsWith('http') ? path : `${base}${path}`;
  return axios({
    method, url, data, params,
    paramsSerializer: params ? { serialize: odataParamsSerializer } : undefined,
    headers: {
      Authorization:  `Bearer ${token}`,
      Accept:         'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version':    '4.0',
      'Content-Type': 'application/json; charset=utf-8',
      Prefer:         'return=representation',
      ...headers,
    },
  });
}
