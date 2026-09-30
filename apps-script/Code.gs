// WE SG Dashboard — Google Sheets script
// ─────────────────────────────────────────────
// Three parts:
//   1. createDashboardSheet — one-time setup that created the Sheet (kept for reference)
//   2. saveMonthlySnapshot  — month-end snapshot to History, then clears Prospects
//   3. Dashboard sync       — sends Sheet edits to the dashboard's database (Supabase)
//
// Setup for the sync is in the repo's README.md. The shared secret is stored in
// Script Properties, never in this file: Project Settings → Script Properties → SYNC_SECRET.
// ─────────────────────────────────────────────

var SHEET_ID = '1fwKgXdFgmR36CygULyHMF3D8CBBKK9pyWC7zAJ319ts';

// ─────────────────────────────────────────────────────────────────────────────
// 1. ONE-TIME SETUP (already run — creates a brand-new sheet if run again)
// ─────────────────────────────────────────────────────────────────────────────

function createDashboardSheet() {

  // ── Create the spreadsheet ──────────────────
  const ss = SpreadsheetApp.create('WE SG Dashboard');
  const url = ss.getUrl();

  // ── ANCHORS tab ─────────────────────────────
  const anchorsSheet = ss.getActiveSheet();
  anchorsSheet.setName('Anchors');

  const anchorHeaders = [['name', 'ini', 'value']];
  const anchorData = [
    ['Energy Market Authority',              'EMA',  750000],
    ['Infocomm Media Development Authority', 'IMDA', 700000],
    ['Sentosa Development Corporation',      'SDC',  500000],
    ['The Ascott Limited',                   'ASC',  500000],
    ['Far East Hospitality',                 'FEH',  450000],
    ['Alliance to End Plastic Waste',        'AEPW', 350000],
    ['Scoot',                                'SCT',  330000],
  ];

  anchorsSheet.getRange('A1:C1').setValues(anchorHeaders);
  anchorsSheet.getRange('A2:C' + (anchorData.length + 1)).setValues(anchorData);

  // Style header row
  anchorsSheet.getRange('A1:C1')
    .setBackground('#800239')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold');

  // Format value column as currency
  anchorsSheet.getRange('C2:C100')
    .setNumberFormat('"S$"#,##0');

  anchorsSheet.setColumnWidth(1, 280);
  anchorsSheet.setColumnWidth(2, 80);
  anchorsSheet.setColumnWidth(3, 120);

  // ── SPRINTS tab ─────────────────────────────
  const sprintsSheet = ss.insertSheet('Sprints');

  const sprintHeaders = [['id', 'team', 'name', 'stage', 'ms']];
  const sprintData = [
    [1, 'BR',     'New-biz pitch generator',     'Scaling',     '09.26'],
    [2, 'BCC',    'Media list builder',           'Prototyping', '08.26'],
    [3, 'CX',     'Client reporting automation',  'Scaling',     '07.26'],
    [4, 'Studio', 'Social content engine',        'Prototyping', '09.26'],
    [5, 'Growth', 'Earned coverage tracker',      'Scoping',     '10.26'],
    [6, 'BR',     'Press release drafting',       'Scaling',     '08.26'],
    [7, 'CX',     'Crisis-response copilot',      'Scoping',     '11.26'],
    [8, 'Studio', 'Award entry writer',           'Scoping',     '10.26'],
  ];

  sprintsSheet.getRange('A1:E1').setValues(sprintHeaders);
  sprintsSheet.getRange('A2:E' + (sprintData.length + 1)).setValues(sprintData);

  // Style header row
  sprintsSheet.getRange('A1:E1')
    .setBackground('#800239')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold');

  // Add data validation for stage column (D)
  const stageRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Scoping', 'Prototyping', 'Scaling'], true)
    .setAllowInvalid(false)
    .build();
  sprintsSheet.getRange('D2:D100').setDataValidation(stageRule);

  // Add data validation for team column (B)
  const teamRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['BR', 'BCC', 'CX', 'Studio', 'Growth'], true)
    .setAllowInvalid(false)
    .build();
  sprintsSheet.getRange('B2:B100').setDataValidation(teamRule);

  sprintsSheet.setColumnWidth(1, 50);
  sprintsSheet.setColumnWidth(2, 80);
  sprintsSheet.setColumnWidth(3, 260);
  sprintsSheet.setColumnWidth(4, 110);
  sprintsSheet.setColumnWidth(5, 70);

  // ── PROSPECTS tab ────────────────────────────
  const prospectsSheet = ss.insertSheet('Prospects');

  const prospectHeaders = [['name', 'industry']];
  const prospectData = [
    ['Sephora',       'Retail & Beauty'],
    ['Klook',         'Travel & Tourism'],
    ['Carousell',     'E-Commerce'],
    ['PropNex',       'Real Estate'],
    ['NTUC',          'Trade & Labour'],
    ['Zalora',        'Retail & Fashion'],
    ['foodpanda',     'Food & Delivery'],
    ['Circles.Life',  'Telecommunications'],
    ['Validus',       'Financial Services'],
    ['StashAway',     'Financial Services'],
  ];

  prospectsSheet.getRange('A1:B1').setValues(prospectHeaders);
  prospectsSheet.getRange('A2:B' + (prospectData.length + 1)).setValues(prospectData);

  // Style header row
  prospectsSheet.getRange('A1:B1')
    .setBackground('#800239')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold');

  prospectsSheet.setColumnWidth(1, 200);
  prospectsSheet.setColumnWidth(2, 200);

  // ── META tab (config) ────────────────────────
  const metaSheet = ss.insertSheet('Meta');

  const metaData = [
    ['key',          'value'],
    ['VAL_TARGET',   8500000],
    ['ANCHOR_MAX',   12],
    ['last_updated', new Date().toISOString()],
  ];

  metaSheet.getRange('A1:B' + metaData.length).setValues(metaData);
  metaSheet.getRange('A1:B1')
    .setBackground('#800239')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold');

  metaSheet.setColumnWidth(1, 140);
  metaSheet.setColumnWidth(2, 200);

  // ── QUOTES tab ───────────────────────────────
  const quotesSheet = ss.insertSheet('Quotes');
  quotesSheet.getRange('A1').setValue('quote');
  quotesSheet.getRange('A1')
    .setBackground('#800239')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold');

  const quoteData = [
    ['"The work that matters is the work clients can\'t do without."'],
    ['"Speed is a strategy. The agency that moves faster wins."'],
    ['"Build deep enough that switching us out costs more than keeping us."'],
    ['"Every great brief starts with a client who trusts you with the real problem."'],
    ['"Compound effort beats brilliant one-offs. Show up, then show up again."'],
    ['"The best ideas don\'t come from pitches — they come from understanding the business."'],
  ];
  quotesSheet.getRange('A2:A' + (quoteData.length + 1)).setValues(quoteData);
  quotesSheet.setColumnWidth(1, 500);

  // ── HISTORY tab (MoM snapshots) ───────────────
  const historySheet = ss.insertSheet('History');
  const histHeaders = [['month', 'anchorCount', 'anchorValue', 'sprintCount', 'prospectCount', 'hotSectors', 'ts']];
  historySheet.getRange('A1:G1').setValues(histHeaders);
  historySheet.getRange('A1:G1')
    .setBackground('#800239')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold');
  historySheet.setColumnWidth(1, 80);
  historySheet.setColumnWidth(2, 100);
  historySheet.setColumnWidth(3, 120);
  historySheet.setColumnWidth(4, 100);
  historySheet.setColumnWidth(5, 120);
  historySheet.setColumnWidth(6, 220);
  historySheet.setColumnWidth(7, 180);
  // Format anchorValue as currency
  historySheet.getRange('C2:C100').setNumberFormat('"S$"#,##0');

  // ── Freeze header rows on all sheets ────────
  [anchorsSheet, sprintsSheet, prospectsSheet, metaSheet, quotesSheet, historySheet].forEach(sheet => {
    sheet.setFrozenRows(1);
  });

  // ── Done — log the URL ───────────────────────
  Logger.log('✅ Sheet created successfully!');
  Logger.log('📋 URL: ' + url);
  Logger.log('📋 Sheet ID: ' + ss.getId());
  Logger.log('Copy the Sheet ID above — you will need it to connect the dashboard.');

  // Show a popup with the Sheet ID
  SpreadsheetApp.getUi && SpreadsheetApp.getUi().alert(
    '✅ Done!\n\nYour sheet ID is:\n' + ss.getId() + '\n\nCopy this — you will need it to connect the dashboard.'
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. MONTHLY SNAPSHOT
// Assign this function to a button in the sheet via Insert → Drawing → Assign script
// Saves full state to History tab, then clears Prospects for the new month
// ─────────────────────────────────────────────────────────────────────────────

function saveMonthlySnapshot() {
  const ss = SpreadsheetApp.openById(SHEET_ID);

  const now   = new Date();
  const label = Utilities.formatDate(now, 'Asia/Singapore', 'MMM yy').toUpperCase();
  const ts    = now.toISOString();

  // Read current state
  const anchorsSheet   = ss.getSheetByName('Anchors');
  const sprintsSheet   = ss.getSheetByName('Sprints');
  const prospectsSheet = ss.getSheetByName('Prospects');
  const historySheet   = ss.getSheetByName('History');
  const metaSheet      = ss.getSheetByName('Meta');

  const anchorRows   = anchorsSheet.getDataRange().getValues().slice(1).filter(r => r[0]);
  const sprintRows   = sprintsSheet.getDataRange().getValues().slice(1).filter(r => r[0]);
  const prospectRows = prospectsSheet.getDataRange().getValues().slice(1).filter(r => r[0]);
  // Tally industries from col B
  const industryTally = {};
  prospectRows.forEach(r => {
    const ind = String(r[1] || '').trim();
    if (ind) industryTally[ind] = (industryTally[ind] || 0) + 1;
  });
  const topSectors = Object.entries(industryTally)
    .sort((a,b) => b[1]-a[1])
    .slice(0,3)
    .map(e => e[0] + ' (' + e[1] + ')')
    .join(' | ');
  const metaRows     = metaSheet.getDataRange().getValues();
  const hotRow       = metaRows.find(r => r[0] === 'hot_sectors');
  const hotSectors   = hotRow ? hotRow[1] : '';
  // Use live-computed top sectors from prospect industries (falls back to Meta, then 'None tagged')
  const computedSectors = topSectors || hotSectors || 'None tagged';

  // Compute anchor delta vs last snapshot
  const historyData = historySheet.getDataRange().getValues();
  const lastSnap    = historyData.length > 1 ? historyData[historyData.length - 1] : null;

  let prevAnchors = {};
  if (lastSnap && lastSnap[7]) {
    try { prevAnchors = JSON.parse(lastSnap[7]); } catch(e) {}
  }

  const anchorDetail = anchorRows.map(r => {
    const name  = r[0], ini = r[1], value = parseInt(r[2]) || 0;
    const prev  = prevAnchors[ini];
    const delta = prev !== undefined ? value - prev : null;
    return { name, ini, value, delta };
  });

  const anchorCount  = anchorRows.length;
  const anchorValue  = anchorRows.reduce((s, r) => s + (parseInt(r[2]) || 0), 0);
  const newAnchors   = anchorDetail.filter(a => a.delta === null).map(a => a.name).join(', ') || 'None';
  const movedUp      = anchorDetail.filter(a => a.delta > 0).map(a => a.name + ' +S$' + a.delta.toLocaleString()).join(', ') || 'None';
  const movedDown    = anchorDetail.filter(a => a.delta < 0).map(a => a.name + ' -S$' + Math.abs(a.delta).toLocaleString()).join(', ') || 'None';

  const currentInis  = anchorRows.map(r => r[1]);
  const droppedAnchs = Object.keys(prevAnchors).filter(ini => !currentInis.includes(ini)).join(', ') || 'None';

  // Sprint detail by stage
  const sprintCount = sprintRows.length;
  const byStage     = { Scoping: [], Prototyping: [], Scaling: [] };
  sprintRows.forEach(r => {
    const stage = r[3] || 'Scoping';
    if (byStage[stage]) byStage[stage].push(r[2]);
  });
  const sprintDetail = [
    'Scoping: '     + (byStage.Scoping.join(', ')     || 'None'),
    'Prototyping: ' + (byStage.Prototyping.join(', ') || 'None'),
    'Scaling: '     + (byStage.Scaling.join(', ')     || 'None'),
  ].join(' | ');

  // Prospect detail
  const prospectCount = prospectRows.length;
  const prospectNames = prospectRows.map(r => r[0] + (r[1] ? ' (' + r[1] + ')' : '')).join(', ') || 'None';

  // Anchor JSON blob for delta tracking next month
  const anchorBlob = JSON.stringify(
    Object.fromEntries(anchorRows.map(r => [r[1], parseInt(r[2]) || 0]))
  );

  // Update History headers if needed (first time running rich snapshot)
  const existingHeaders = historySheet.getRange(1, 1, 1, historySheet.getLastColumn()).getValues()[0];
  if (!existingHeaders[7]) {
    historySheet.getRange(1, 1, 1, 14).setValues([[
      'month', 'anchorCount', 'anchorValue', 'sprintCount', 'prospectCount',
      'hotSectors', 'ts', 'anchorBlob', 'newAnchors', 'droppedAnchors',
      'valueUp', 'valueDown', 'sprintDetail', 'allProspects'
    ]]);
    historySheet.getRange(1, 1, 1, 14)
      .setBackground('#800239')
      .setFontColor('#FFFFFF')
      .setFontWeight('bold');
    historySheet.setColumnWidths(1, 14, 140);
    historySheet.setColumnWidth(8, 300); // anchorBlob wider
    historySheet.setColumnWidth(14, 400); // allProspects wider
  }

  // Append snapshot row
  historySheet.appendRow([
    label,           // A: month
    anchorCount,     // B: anchor count
    anchorValue,     // C: anchor total value (S$)
    sprintCount,     // D: sprint count
    prospectCount,   // E: prospect count
    computedSectors, // F: hot sectors (top 3 industries this month)
    ts,              // G: timestamp
    anchorBlob,      // H: anchor JSON for delta calc next month
    newAnchors,      // I: new anchor clients
    droppedAnchs,    // J: dropped anchor clients
    movedUp,         // K: anchors with value increase
    movedDown,       // L: anchors with value decrease
    sprintDetail,    // M: sprints by stage
    prospectNames,   // N: all prospects this month
  ]);

  // Format the new anchorValue cell as currency
  const newRow = historySheet.getLastRow();
  historySheet.getRange(newRow, 3).setNumberFormat('"S$"#,##0');

  // Clear prospects for the new month — names AND industries, so a new name
  // typed into an old row doesn't inherit last month's industry.
  const lastPRow = prospectsSheet.getLastRow();
  if (lastPRow > 1) {
    prospectsSheet.getRange(2, 1, lastPRow - 1, 2).clearContent();
  }

  // Script edits don't fire the sync trigger, so tell the dashboard directly
  // that Prospects is now empty (normally an empty tab is refused as a slip).
  let syncNote = 'Dashboard updated.';
  try {
    pushTab_('Prospects', { allowEmpty: true });
  } catch (err) {
    syncNote = 'Dashboard NOT updated (' + err.message + '). Run Dashboard sync → Send all tabs to the dashboard now.';
  }

  // Confirm summary
  alert_(
    'Snapshot saved for ' + label + '\n\n' +
    'Anchors: ' + anchorCount + ' clients | S$' + anchorValue.toLocaleString() + '\n' +
    'New clients: ' + newAnchors + '\n' +
    'Dropped: ' + droppedAnchs + '\n' +
    'Value up: ' + movedUp + '\n' +
    'Value down: ' + movedDown + '\n' +
    'Sprints: ' + sprintCount + '\n' +
    'Prospects archived: ' + prospectCount + ' names saved, list cleared for new month.\n' +
    syncNote + '\n\n' +
    'Add your new prospects for next month now.'
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. DASHBOARD SYNC — Sheet → Supabase
// Sends a tab to the dashboard's database whenever someone edits it. The
// dashboard copies its own edits back to the Sheet, so both stay in step.
// ─────────────────────────────────────────────────────────────────────────────

var ENDPOINT = 'https://we-sg-dashboard.vercel.app/api/sheet-sync';

// Sheet tab name → list name in the database.
var TABS = {
  Anchors:   'anchors',
  Sprints:   'sprints',
  Prospects: 'prospects',
  Quotes:    'quotes',
};

// Adds the "Dashboard sync" menu when the Sheet opens (only if this script is
// attached to the Sheet; otherwise run the functions from the editor's ▶ Run).
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Dashboard sync')
    .addItem('Send all tabs to the dashboard now', 'pushAllTabs')
    .addItem('Turn on automatic sync', 'installTrigger')
    .addToUi();
}

// Installable edit trigger. A simple onEdit() can't call outside services,
// so this runs as the person who turned sync on. Edits made by scripts or by
// the dashboard (through the Sheets API) don't fire it, so the two sides never loop.
function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'handleEdit') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('handleEdit').forSpreadsheet(SpreadsheetApp.openById(SHEET_ID)).onEdit().create();
  alert_('Automatic sync is on. Edits to the Anchors, Sprints, Prospects and Quotes tabs now reach the dashboard within a few seconds.');
}

function handleEdit(e) {
  var name = e && e.range ? e.range.getSheet().getName() : '';
  if (!TABS[name]) return;
  pushTab_(name);
}

function pushAllTabs() {
  var results = Object.keys(TABS).map(function (name) {
    try {
      return name + ': ' + pushTab_(name);
    } catch (err) {
      return name + ': failed (' + err.message + ')';
    }
  });
  alert_(results.join('\n'));
}

function pushTab_(name, opts) {
  var secret = PropertiesService.getScriptProperties().getProperty('SYNC_SECRET');
  if (!secret) throw new Error('SYNC_SECRET is not set in Script Properties');

  var tab = SpreadsheetApp.openById(SHEET_ID).getSheetByName(name);
  if (!tab) throw new Error('No tab called ' + name);

  // Only one push at a time, so quick edits arrive in order.
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var res = UrlFetchApp.fetch(ENDPOINT, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'X-Sync-Secret': secret },
      payload: JSON.stringify({
        entity: TABS[name],
        // Display values, so milestones like 09.26 stay text instead of becoming 9.26.
        values: tab.getDataRange().getDisplayValues(),
        allowEmpty: !!(opts && opts.allowEmpty),
      }),
      muteHttpExceptions: true,
    });
    var body = JSON.parse(res.getContentText() || '{}');
    if (res.getResponseCode() !== 200) throw new Error(body.error || ('HTTP ' + res.getResponseCode()));
    return body.count + ' rows sent';
  } finally {
    lock.releaseLock();
  }
}

// Pop-up when run from the Sheet; log line when run from a trigger or the editor.
function alert_(message) {
  try {
    SpreadsheetApp.getUi().alert(message);
  } catch (err) {
    Logger.log(message);
  }
}
