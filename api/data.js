// api/data.js — Vercel Edge Function the dashboard talks to.
//   GET                → everything the dashboard shows, from Supabase
//   PUT ?entity=<name> → replace one list in Supabase, then copy it to the Sheet
// Protected by the site password in middleware.js.

import { readAll, replace, mirrorToSheet } from './_lib/store.js';

export const config = { runtime: 'edge' };

// The dashboard edits these lists. Quotes are edited in the Sheet only.
const WRITABLE = ['anchors', 'sprints', 'prospects'];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export default async function handler(req) {
  const entity = new URL(req.url).searchParams.get('entity');

  try {
    if (req.method === 'GET') {
      return json({ ...(await readAll()), ts: Date.now() });
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      if (!WRITABLE.includes(entity)) return json({ error: 'Unknown entity' }, 400);

      // Until the Sheet's data has been copied in, the dashboard is showing its
      // built-in sample data. Saving then would overwrite the real Sheet with
      // it, so refuse writes while every list is still empty.
      const current = await readAll();
      if (Object.values(current).every(list => list.length === 0)) {
        return json({ error: 'Database is empty: run "Send all tabs to the dashboard now" in the Sheet first' }, 409);
      }

      const body = await req.json();
      await replace(entity, body[entity]);

      // Supabase is saved at this point. A failed Sheet copy is logged and
      // reported, but doesn't fail the save; the next dashboard edit to this
      // list copies it again.
      let sheet = 'ok';
      try {
        await mirrorToSheet(entity);
      } catch (err) {
        console.error('[sheet mirror]', err);
        sheet = 'failed';
      }
      return json({ ok: true, sheet });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error(err);
    return json({ error: err.message }, 500);
  }
}
