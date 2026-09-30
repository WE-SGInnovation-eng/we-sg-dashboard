// api/sheet-sync.js — Vercel Edge Function called by the Google Sheet's script
// (apps-script/Code.gs) whenever someone edits a tab, and once to copy all
// existing Sheet data into Supabase.
//
// POST { entity: 'anchors' | 'sprints' | 'prospects' | 'quotes', values: [[...], ...] }
// with header `X-Sync-Secret: <SHEET_SYNC_SECRET>`.
//
// This path skips the site password (middleware.js) because the script can't
// log in; the shared secret protects it instead.

import { ENTITIES, parseSheetRows, replace } from './_lib/store.js';

export const config = { runtime: 'edge' };

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Compare without leaking how many leading characters matched.
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default async function handler(req) {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const secret = process.env.SHEET_SYNC_SECRET;
  if (!secret || !safeEqual(req.headers.get('x-sync-secret') || '', secret)) {
    return json({ error: 'Unauthorised' }, 401);
  }

  try {
    const { entity, values } = await req.json();
    if (!ENTITIES.includes(entity)) return json({ error: 'Unknown entity' }, 400);

    const rows = parseSheetRows(entity, values);

    // A tab with no rows is almost always a mid-edit accident (a cleared range,
    // a sort in progress), not a real request to delete everything. Refuse it,
    // so one slip in the Sheet can't wipe the dashboard.
    if (!rows.length) return json({ error: `No ${entity} rows found; nothing saved` }, 422);

    await replace(entity, rows);
    return json({ ok: true, entity, count: rows.length });
  } catch (err) {
    console.error(err);
    return json({ error: err.message }, 500);
  }
}
