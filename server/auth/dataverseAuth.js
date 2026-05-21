import axios from 'axios';

let cachedToken = null;
let expiresAt = 0;
let inFlight = null;

export async function getAccessToken() {
  const now = Date.now();
  // refresh 60s before real expiry
  if (cachedToken && now < expiresAt - 60_000) return cachedToken;
  if (inFlight) return inFlight;

  const { TENANT_ID, CLIENT_ID, CLIENT_SECRET, ORG_URL } = process.env;
  if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET || !ORG_URL) {
    throw new Error('Missing TENANT_ID / CLIENT_ID / CLIENT_SECRET / ORG_URL in env');
  }

  const tokenUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: `https://${ORG_URL}/.default`,
  });

  inFlight = axios
    .post(tokenUrl, params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    .then((res) => {
      cachedToken = res.data.access_token;
      expiresAt = Date.now() + res.data.expires_in * 1000;
      return cachedToken;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

export function dataverseBaseUrl() {
  return `https://${process.env.ORG_URL}/api/data/v9.2`;
}

export async function dvRequest({ method = 'GET', path, data, params, headers = {} }) {
  const token = await getAccessToken();
  const url = path.startsWith('http') ? path : `${dataverseBaseUrl()}${path}`;
  return axios({
    method,
    url,
    data,
    params,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      'Content-Type': 'application/json; charset=utf-8',
      Prefer: 'return=representation',
      ...headers,
    },
  });
}
