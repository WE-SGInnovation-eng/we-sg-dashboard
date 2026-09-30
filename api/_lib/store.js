// api/_lib/store.js — the dashboard's data, stored in Supabase and mirrored
// to the Google Sheet. Shared by /api/data (the dashboard) and
// /api/sheet-sync (edits made in the Sheet).
//
// Supabase is reached through its REST API with the service role key, which
// lives only in Vercel's environment variables.

import { getAccessToken, clearAndWriteRange } from './google.js';

export const ENTITIES = ['anchors', 'sprints', 'prospects', 'quotes'];

function supabase(path, init = {}) {
  const base = process.env.SUPABASE_URL;
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set');

  return fetch(`${base.replace(/\/+$/, '')}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey:         key,
      Authorization:  `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
}

async function select(table, columns) {
  const res  = await supabase(`${table}?select=${columns}&order=position.asc`);
  const data = await res.json();
  // Throw rather than return [] so a failed read is a 500, not an empty list
  // the dashboard would mistake for "everything was deleted".
  if (!res.ok) throw new Error(`Supabase read failed for ${table}: ${data.message || res.status}`);
  return data;
}

// ── Read ─────────────────────────────────────────────────────────────────────

export async function readAll() {
  const [anchors, sprints, prospects, quotes] = await Promise.all([
    select('anchors',   'name,ini,value'),
    select('sprints',   'id,team,name,stage,ms'),
    select('prospects', 'name,industry'),
    select('quotes',    'text'),
  ]);
  return { anchors, sprints, prospects, quotes: quotes.map(q => q.text) };
}

// ── Write ────────────────────────────────────────────────────────────────────

// Replace one list in a single transaction (see supabase/schema.sql).
export async function replace(entity, rows) {
  if (!ENTITIES.includes(entity)) throw new Error(`Unknown entity: ${entity}`);
  if (!Array.isArray(rows)) throw new Error(`Expected a list of ${entity}`);

  const res = await supabase(`rpc/replace_${entity}`, {
    method: 'POST',
    body:   JSON.stringify({ rows }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`Supabase write failed for ${entity}: ${data.message || res.status}`);
  }
}

// ── Mirror to the Sheet ──────────────────────────────────────────────────────

const SHEET_LAYOUT = {
  anchors:   { range: 'Anchors!A:C',   header: ['name', 'ini', 'value'],               row: a => [a.name, a.ini, a.value] },
  sprints:   { range: 'Sprints!A:E',   header: ['id', 'team', 'name', 'stage', 'ms'],  row: s => [s.id, s.team, s.name, s.stage, s.ms] },
  prospects: { range: 'Prospects!A:B', header: ['name', 'industry'],                   row: p => [p.name, p.industry] },
  quotes:    { range: 'Quotes!A:A',    header: ['quote'],                              row: q => [q] },
};

// Copy the saved list from Supabase back to its Sheet tab. Writes made through
// the Sheets API do not fire the Sheet's edit trigger, so this never loops back.
export async function mirrorToSheet(entity) {
  const layout = SHEET_LAYOUT[entity];
  const data   = await readAll();
  const token  = await getAccessToken();
  await clearAndWriteRange(token, layout.range, [layout.header, ...data[entity].map(layout.row)]);
}

// ── Parse rows sent by the Sheet's script ────────────────────────────────────
// `values` is the tab exactly as shown in the Sheet, header row first.

export function parseSheetRows(entity, values) {
  const rows = (values || []).slice(1).filter(r => r && String(r[0] ?? '').trim());
  const str  = v => (v == null ? '' : String(v).trim());

  switch (entity) {
    case 'anchors':   return rows.map(r => ({ name: str(r[0]), ini: str(r[1]), value: str(r[2]) }));
    case 'sprints':   return rows.map(r => ({ id: str(r[0]), team: str(r[1]), name: str(r[2]), stage: str(r[3]), ms: str(r[4]) }));
    case 'prospects': return rows.map(r => ({ name: str(r[0]), industry: str(r[1]) }));
    case 'quotes':    return rows.map(r => str(r[0]));
    default:          throw new Error(`Unknown entity: ${entity}`);
  }
}
