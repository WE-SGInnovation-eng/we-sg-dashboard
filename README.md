# WE SG Dashboard — Sheets Sync Setup

## What's in this folder

```
/api/sheets.js       ← Vercel Edge Function (proxies Sheets API)
/public/index.html   ← Dashboard with sync wired in
/vercel.json         ← Vercel config
README.md            ← This file
```

---

## Step 1 — Add environment variables to Vercel

In your Vercel project dashboard → Settings → Environment Variables, add:

| Name                   | Value                                      |
|------------------------|--------------------------------------------|
| `GOOGLE_SERVICE_EMAIL` | The client_email from your service account JSON |
| `GOOGLE_PRIVATE_KEY`   | The private_key from your service account JSON  |

For `GOOGLE_PRIVATE_KEY`: paste the full value including the
`-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines.
Vercel stores it encrypted. Never put it in code.

---

## Step 2 — Deploy to Vercel

Option A (Vercel CLI):
```bash
npm i -g vercel
vercel --prod
```

Option B (GitHub):
- Push this folder to a GitHub repo
- Import the repo in vercel.com
- It will auto-deploy

---

## Step 3 — Update the API URL in the dashboard

In `public/index.html`, find this line near the bottom:

```js
const API = 'https://YOUR-PROJECT.vercel.app/api/sheets';
```

Replace `YOUR-PROJECT` with your actual Vercel project subdomain.
(Find it in Vercel dashboard → your project → Domains)

---

## How the sync works

**Sheets → Dashboard**
The dashboard polls `/api/sheets` every 5 seconds.
If anything changed in the sheet since the last poll, it re-renders only
the affected section (anchors, sprints, or prospects).
No full page reload.

**Dashboard → Sheets**
When you edit an anchor, sprint stage, or prospect in the dashboard,
it calls `syncToSheets(entity)` which fires a PUT to `/api/sheets?entity=X`
800ms after the last keystroke (debounced to avoid hammering).
The Vercel Edge Function writes the full updated list back to the sheet.

---

## Your Sheet ID
`1fwKgXdFgmR36CygULyHMF3D8CBBKK9pyWC7zAJ319ts`
(already hardcoded in api/sheets.js)

---

## Troubleshooting

**Dashboard shows hardcoded data, not Sheets data**
→ Check browser console for `[sync] initial load failed`
→ Verify GOOGLE_SERVICE_EMAIL and GOOGLE_PRIVATE_KEY are set in Vercel
→ Confirm the service account has Editor access to the sheet

**Edits in dashboard don't appear in Sheets**
→ Open Network tab in DevTools, look for PUT /api/sheets requests
→ Check the response — a 500 error means the credentials are wrong

**Edits in Sheets don't appear in dashboard**
→ Wait up to 5 seconds for the next poll cycle
→ Check console for `[sync] updated from Sheets` log messages

---

## Deployment

The Vercel project is connected to this GitHub repo. Every push/merge to
`main` automatically deploys to production at
https://we-sg-dashboard.vercel.app (build serves the `public/` folder per
`vercel.json`). No manual step is needed — just merge to `main`.
