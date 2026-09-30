// api/_lib/google.js — Google Sheets access for the edge functions.
// Supabase is the dashboard's database; the Sheet is kept in step with it
// so people can keep editing there. Credentials never touch the browser.

export const SHEET_ID  = '1fwKgXdFgmR36CygULyHMF3D8CBBKK9pyWC7zAJ319ts';
const SCOPES    = 'https://www.googleapis.com/auth/spreadsheets';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

// ── JWT / OAuth helpers ──────────────────────────────────────────────────────

function b64url(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Cache the OAuth token across invocations. Edge instances stay warm between
// requests, so without this every request — including every 5s poll — paid for
// a fresh JWT sign + round-trip to Google's token endpoint before any Sheets
// read could start. Tokens live ~1h; we refresh 5min early to be safe.
let _token    = null;
let _tokenExp = 0; // unix seconds

export async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (_token && now < _tokenExp - 300) return _token;

  const email      = process.env.GOOGLE_SERVICE_EMAIL;
  const rawKey     = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');

  const header  = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: email, scope: SCOPES, aud: TOKEN_URL, iat: now, exp: now + 3600,
  }));

  const signing  = `${header}.${payload}`;
  const keyData  = rawKey
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');

  const binaryKey = Uint8Array.from(atob(keyData), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', binaryKey.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );

  const sigBuffer  = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey,
    new TextEncoder().encode(signing)
  );
  const signature  = b64url(String.fromCharCode(...new Uint8Array(sigBuffer)));
  const jwt        = `${signing}.${signature}`;

  const res  = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`Auth failed: ${data.error_description || data.error || res.status}`);
  }

  _token    = data.access_token;
  _tokenExp = now + (data.expires_in || 3600);
  return _token;
}

// ── Sheets helpers ───────────────────────────────────────────────────────────

export async function writeRange(token, range, values) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const res  = await fetch(url, {
    method:  'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ range, majorDimension: 'ROWS', values }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Sheets write failed for ${range}: ${data.error?.message || res.status}`);
  }
  return data;
}

export async function clearAndWriteRange(token, range, values) {
  // Clear first, then write, so rows removed in the dashboard disappear from the Sheet
  const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}:clear`;
  const res = await fetch(clearUrl, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Sheets clear failed for ${range}: ${res.status}`);
  return writeRange(token, range, values);
}
