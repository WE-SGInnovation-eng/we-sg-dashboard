// api/sheets.js — Vercel Edge Function
// Proxies all Google Sheets reads and writes.
// Credentials never touch the browser.

export const config = { runtime: 'edge' };

const SHEET_ID  = '1fwKgXdFgmR36CygULyHMF3D8CBBKK9pyWC7zAJ319ts';
const SCOPES    = 'https://www.googleapis.com/auth/spreadsheets';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

// ── JWT / OAuth helpers ──────────────────────────────────────────────────────

function b64url(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getAccessToken() {
  const email      = process.env.GOOGLE_SERVICE_EMAIL;
  const rawKey     = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
  const now        = Math.floor(Date.now() / 1000);

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
  return data.access_token;
}

// ── Sheets helpers ───────────────────────────────────────────────────────────

async function readRange(token, range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE`;
  const res  = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  return data.values || [];
}

async function writeRange(token, range, values) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const res  = await fetch(url, {
    method:  'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ range, majorDimension: 'ROWS', values }),
  });
  return res.json();
}

async function appendRow(token, range, values) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const res  = await fetch(url, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ range, majorDimension: 'ROWS', values }),
  });
  return res.json();
}

async function clearAndWriteRange(token, range, values) {
  // Clear first, then write — used for prospects (flat list)
  const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}:clear`;
  await fetch(clearUrl, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  return writeRange(token, range, values);
}

// ── Parse sheet rows into objects ────────────────────────────────────────────

function parseAnchors(rows) {
  return rows.slice(1).filter(r => r[0]).map(r => ({
    name:  r[0] || '',
    ini:   r[1] || '',
    value: Math.round(Number(String(r[2] || '0').replace(/[^0-9.]/g, ''))) || 0,
  }));
}

function parseSprints(rows) {
  return rows.slice(1).filter(r => r[0]).map(r => ({
    id:    parseInt(r[0], 10),
    team:  r[1] || '',
    name:  r[2] || '',
    stage: r[3] || 'Scoping',
    ms:    r[4] != null ? String(r[4]) : '',
  }));
}

function parseProspects(rows) {
  return rows.slice(1).filter(r => r[0]).map(r => r[0]);
}

// ── CORS headers ─────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// ── Main handler ─────────────────────────────────────────────────────────────

export default async function handler(req) {

  // Preflight
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const url    = new URL(req.url);
  const action = url.searchParams.get('action'); // 'read' | 'write'
  const entity = url.searchParams.get('entity'); // 'anchors' | 'sprints' | 'prospects'

  try {
    const token = await getAccessToken();

    // ── GET all data ──────────────────────────────────────────────────────
    if (req.method === 'GET' || action === 'read') {
      const [anchorRows, sprintRows, prospectRows] = await Promise.all([
        readRange(token, 'Anchors!A:C'),
        readRange(token, 'Sprints!A:E'),
        readRange(token, 'Prospects!A:A'),
      ]);

      return json({
        anchors:   parseAnchors(anchorRows),
        sprints:   parseSprints(sprintRows),
        prospects: parseProspects(prospectRows),
        ts:        Date.now(),
      });
    }

    // ── POST / PUT — write back ───────────────────────────────────────────
    if (req.method === 'POST' || req.method === 'PUT') {
      const body = await req.json();

      if (entity === 'anchors') {
        // Full replace of anchors list
        const rows = [
          ['name', 'ini', 'value'],
          ...body.anchors.map(a => [a.name, a.ini, a.value]),
        ];
        await clearAndWriteRange(token, 'Anchors!A:C', rows);
        return json({ ok: true });
      }

      if (entity === 'sprints') {
        // Full replace of sprints list
        const rows = [
          ['id', 'team', 'name', 'stage', 'ms'],
          ...body.sprints.map(s => [s.id, s.team, s.name, s.stage, s.ms]),
        ];
        await clearAndWriteRange(token, 'Sprints!A:E', rows);
        return json({ ok: true });
      }

      if (entity === 'prospects') {
        // Full replace of prospects list
        const rows = [
          ['name'],
          ...body.prospects.map(p => [p]),
        ];
        await clearAndWriteRange(token, 'Prospects!A:A', rows);
        return json({ ok: true });
      }

      return json({ error: 'Unknown entity' }, 400);
    }

    return json({ error: 'Method not allowed' }, 405);

  } catch (err) {
    console.error(err);
    return json({ error: err.message }, 500);
  }
}
