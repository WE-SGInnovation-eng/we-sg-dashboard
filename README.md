# WE SG Dashboard

Live at https://we-sg-dashboard.vercel.app (password protected).

The dashboard's data lives in **Supabase**. The **Google Sheet** stays in step
with it both ways, so the team can keep editing there:

- **Dashboard → Supabase → Sheet.** Each edit in the dashboard is saved to
  Supabase, then copied to the matching Sheet tab.
- **Sheet → Supabase → dashboard.** A small script in the Sheet sends a tab to
  Supabase whenever someone edits it. The dashboard checks for changes every
  5 seconds.

If the same list is edited in both places within a few seconds, the last save
wins.

## What's in this repo

```
public/index.html        The dashboard (Vercel serves public/, per vercel.json)
api/data.js              Dashboard reads and saves (Supabase, then Sheet copy)
api/sheet-sync.js        Receives edits from the Sheet's script
api/_lib/store.js        Supabase access and Sheet copying, shared by both
api/_lib/google.js       Google Sheets sign-in and writes
middleware.js            Site password (skipped for /api/sheet-sync, which has its own secret)
supabase/schema.sql      Database tables and save functions
apps-script/Code.gs      Script that goes in the Google Sheet
```

## Data

| Sheet tab   | Supabase table | Columns                          | Edited in           |
|-------------|----------------|----------------------------------|---------------------|
| `Anchors`   | `anchors`      | name, ini, value                 | Dashboard and Sheet |
| `Sprints`   | `sprints`      | id, team, name, stage, ms        | Dashboard and Sheet |
| `Prospects` | `prospects`    | name, industry                   | Dashboard and Sheet |
| `Quotes`    | `quotes`       | quote                            | Sheet only          |

Sheet ID: `1fwKgXdFgmR36CygULyHMF3D8CBBKK9pyWC7zAJ319ts`
(set in `api/_lib/google.js`).

## Environment variables (Vercel → Settings → Environment Variables)

| Name                        | What it is                                                    |
|-----------------------------|---------------------------------------------------------------|
| `DASHBOARD_PASSWORD`        | Site password                                                 |
| `SUPABASE_URL`              | Supabase → Project Settings → API → Project URL              |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` key       |
| `SHEET_SYNC_SECRET`         | Any long random string; the same value goes in the Sheet script |
| `GOOGLE_SERVICE_EMAIL`      | `client_email` from the Google service account JSON          |
| `GOOGLE_PRIVATE_KEY`        | `private_key` from the same JSON, including the BEGIN/END lines |

The service role key can read and change everything in the database. Keep it
in Vercel only; never put it in code or in the Sheet.

## Setting up the move to Supabase (one time)

Do the steps in this order. Until step 5 has run, the dashboard shows its
built-in sample data and refuses saves, so the real Sheet can't be overwritten.

1. **Create the database.** In [Supabase](https://supabase.com), create a
   project (Singapore region). Open **SQL Editor**, paste all of
   `supabase/schema.sql`, and select **Run**.
2. **Add the keys to Vercel.** Add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   and `SHEET_SYNC_SECRET` (see the table above). Keep the existing
   `GOOGLE_*` and `DASHBOARD_PASSWORD` values.
3. **Deploy.** Merge this change to `main`. Vercel deploys it automatically.
4. **Update the Sheet's script.** Open the Apps Script project that holds
   `saveMonthlySnapshot` and replace all of `Code.gs` with
   `apps-script/Code.gs` from this repo. That file contains the existing setup
   and snapshot code plus the new sync, so nothing is lost. Save, then open
   **Project Settings → Script Properties**, add `SYNC_SECRET` with the same
   value as `SHEET_SYNC_SECRET`, and save.
5. **Copy the data across.** Reload the Sheet. From the new
   **Dashboard sync** menu, select **Send all tabs to the dashboard now** and
   allow the permissions Google asks for. Each tab should report how many rows
   it sent. (No menu? The script isn't attached to the Sheet. In the Apps
   Script editor, choose `pushAllTabs` and select **Run** instead; the result
   appears under **Execution log**.)
6. **Turn on automatic sync.** From the same menu, select
   **Turn on automatic sync** (or run `installTrigger` from the editor). Edits
   in the Sheet now reach the dashboard.

After that, the old Sheets-only setup is gone; nothing else needs changing.

## Troubleshooting

**The dashboard shows sample data, not your data**
→ Step 5 hasn't run, or it failed. Run **Send all tabs to the dashboard now** again and read the result.
→ In the browser console, look for `[sync] initial load failed`. A 500 from `/api/data` usually means `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing or wrong.

**Monthly snapshot**
`saveMonthlySnapshot` archives the month to History, clears the Prospects tab
(names and industries), and tells the dashboard the list is now empty. Its
summary pop-up says whether the dashboard was updated.

**Sheet edits don't reach the dashboard**
→ Make sure **Turn on automatic sync** has been run. Google emails the person who turned it on when a sync fails.
→ "Unauthorised" means `SYNC_SECRET` in the Sheet doesn't match `SHEET_SYNC_SECRET` in Vercel.
→ Clearing every row of a tab is refused on purpose, so one slip can't wipe the dashboard.

**Dashboard edits don't reach the Sheet**
→ The save response includes `"sheet": "failed"` when the Sheet copy didn't work. Check `GOOGLE_SERVICE_EMAIL` and `GOOGLE_PRIVATE_KEY`, and that the service account still has Editor access to the Sheet. The data is still saved in Supabase, and the next edit to that list copies it again.

## Deployment

The Vercel project is connected to this GitHub repo. Every push or merge to
`main` deploys to production automatically.
