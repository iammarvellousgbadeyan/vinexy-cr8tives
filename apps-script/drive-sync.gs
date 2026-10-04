/**
 * Vinexy Graduate Jotter: Google Drive + Sheets mirror.
 * Deploy: script.google.com > New project > paste this > Project Settings > Script properties: add SECRET (same value as
 * DRIVE_WEBHOOK_SECRET in Netlify) > Deploy > New deployment > Web app > Execute as: Me, Who has access: Anyone > copy the URL
 * into Netlify as DRIVE_WEBHOOK_URL. The secret is what protects it.
 *
 * Creates:  Graduation Magazine Orders / <ORDER ID - Customer> / Photos, Colour References, Design Proofs, Final Files, Payment-Order Records
 * Supabase stays the source of truth. This is a convenient copy that updates on every verified payment.
 */
var ROOT_NAME = 'Graduation Magazine Orders';
var SUBS = ['Photos', 'Colour References', 'Design Proofs', 'Final Files', 'Payment-Order Records'];

function doPost(e) {
  var secret = PropertiesService.getScriptProperties().getProperty('SECRET');
  var p = JSON.parse(e.postData.contents);
  if (!secret || p.secret !== secret) return out_({ error: 'forbidden' });
  var o = p.order;
  var root = sub_(DriveApp.getRootFolder(), ROOT_NAME);
  var folder = sub_(root, o.order_no + ' - ' + o.customer);
  var subs = {};
  SUBS.forEach(function (n) { subs[n] = sub_(folder, n); });

  (p.files || []).forEach(function (f) {
    var target = f.kind === 'photo' ? subs['Photos'] : f.kind === 'colour_ref' ? subs['Colour References'] : null;
    if (!target) return;
    var name = f.name || 'file';
    if (target.getFilesByName(name).hasNext()) return;
    target.createFile(UrlFetchApp.fetch(f.url).getBlob().setName(name));
  });

  var rec = subs['Payment-Order Records'];
  var recName = o.order_no + ' record.json';
  var it = rec.getFilesByName(recName);
  var body = JSON.stringify(o, null, 2);
  if (it.hasNext()) it.next().setContent(body); else rec.createFile(recName, body, MimeType.PLAIN_TEXT);

  var sheet = sheet_(root);
  var rows = sheet.getDataRange().getValues();
  var line = [o.order_no, o.customer, o.phone, o.email, o.package, o.qty, o.total, o.paid, o.balance, o.payment_status, o.details && o.details.school, new Date()];
  var found = -1;
  for (var i = 1; i < rows.length; i++) if (rows[i][0] === o.order_no) { found = i + 1; break; }
  if (found > 0) sheet.getRange(found, 1, 1, line.length).setValues([line]); else sheet.appendRow(line);
  return out_({ ok: true });
}

function sub_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
function sheet_(root) {
  var name = 'Graduation Magazine Orders Log';
  var it = root.getFilesByName(name);
  if (it.hasNext()) return SpreadsheetApp.open(it.next()).getSheets()[0];
  var ss = SpreadsheetApp.create(name);
  DriveApp.getFileById(ss.getId()).moveTo(root);
  var s = ss.getSheets()[0];
  s.appendRow(['Order ID', 'Customer', 'Phone', 'Email', 'Package', 'Copies', 'Total', 'Paid', 'Balance', 'Payment status', 'School', 'Updated']);
  return s;
}
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
