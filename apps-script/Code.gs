/**
 * WE SG Dashboard: Sheet → Supabase sync.
 *
 * Paste this into the dashboard's Google Sheet (Extensions → Apps Script).
 * It sends a tab to the dashboard's database whenever someone edits it, and
 * adds a "Dashboard sync" menu with a button that sends every tab at once.
 * Setup steps are in the repo's README.md.
 *
 * The shared secret is stored in Script Properties, never in this file:
 * Project Settings → Script Properties → SYNC_SECRET.
 */

var ENDPOINT = 'https://we-sg-dashboard.vercel.app/api/sheet-sync';

// Sheet tab name → list name in the database.
var TABS = {
  Anchors:   'anchors',
  Sprints:   'sprints',
  Prospects: 'prospects',
  Quotes:    'quotes',
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Dashboard sync')
    .addItem('Send all tabs to the dashboard now', 'pushAllTabs')
    .addItem('Turn on automatic sync', 'installTrigger')
    .addToUi();
}

// Installable edit trigger. A simple onEdit() can't call outside services,
// so this runs as the person who turned sync on. Edits the dashboard makes
// through the Sheets API don't fire it, so the two sides never loop.
function installTrigger() {
  var sheet = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'handleEdit') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('handleEdit').forSpreadsheet(sheet).onEdit().create();
  SpreadsheetApp.getUi().alert('Automatic sync is on. Edits to the Anchors, Sprints, Prospects and Quotes tabs now reach the dashboard within a few seconds.');
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
  SpreadsheetApp.getUi().alert(results.join('\n'));
}

function pushTab_(name) {
  var secret = PropertiesService.getScriptProperties().getProperty('SYNC_SECRET');
  if (!secret) throw new Error('SYNC_SECRET is not set in Script Properties');

  var tab = SpreadsheetApp.getActive().getSheetByName(name);
  if (!tab) throw new Error('No tab called ' + name);

  // Only one push at a time, so quick edits arrive in order.
  var lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    var res = UrlFetchApp.fetch(ENDPOINT, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'X-Sync-Secret': secret },
      // Display values, so milestones like 09.26 stay text instead of becoming 9.26.
      payload: JSON.stringify({ entity: TABS[name], values: tab.getDataRange().getDisplayValues() }),
      muteHttpExceptions: true,
    });
    var body = JSON.parse(res.getContentText() || '{}');
    if (res.getResponseCode() !== 200) throw new Error(body.error || ('HTTP ' + res.getResponseCode()));
    return body.count + ' rows sent';
  } finally {
    lock.releaseLock();
  }
}
