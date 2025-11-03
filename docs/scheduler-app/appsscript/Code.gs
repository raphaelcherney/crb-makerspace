/**
 * Google Apps Script backend for CRB Makerspace Scheduler
 * Endpoints (Web App):
 *  - GET  ?action=reservations&date=YYYY-MM-DD
 *  - POST action=reserve ... (x-www-form-urlencoded)
 * Stores PII in sheet but never returns PII in GET.
 */

function getProp_(key, def) {
  const v = PropertiesService.getScriptProperties().getProperty(key);
  return v != null ? v : def;
}

function getSheet_(){
  // Try to get the active spreadsheet first (if script is bound to the sheet)
  let ss = null;
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  } catch(e) {
    // Script is not bound to a sheet, use SHEET_ID
  }
  
  // If no active spreadsheet, use SHEET_ID
  if(!ss) {
    const id = getProp_('SHEET_ID', '');
    if(!id) {
      throw new Error('SHEET_ID script property not set. Go to Project Settings → Script properties and add SHEET_ID. Alternatively, create the Apps Script from Extensions → Apps Script in your Google Sheet.');
    }
    try {
      ss = SpreadsheetApp.openById(id);
      if(!ss) throw new Error('Cannot open spreadsheet with ID: ' + id);
    } catch(e) {
      throw new Error('Error accessing spreadsheet: ' + e.toString() + '. Check that SHEET_ID is correct (' + id + ') and the script has permission to access the sheet. You may need to authorize the script by running it once.');
    }
  }
  
  // Get the sheet by name
  const name = getProp_('SHEET_NAME', 'Reservations');
  const sh = ss.getSheetByName(name) || ss.getSheets()[0];
  if(!sh) throw new Error('Cannot find sheet named: ' + name + '. Available sheets: ' + ss.getSheets().map(s => s.getName()).join(', '));
  return sh;
}

function allowlistPrinters_(){
  const list = getProp_('PRINTERS', 'R2-3D2 (Bambu X1C),C3DPO (Bambu X1C),PLA Trooper (Bambu P1S),Hydra (Prusa XL)');
  return list.split(',').map(function(s){ return s.trim(); }).filter(String);
}

function originHeader_(){
  // Use a fixed origin (or *) from Script Properties. Apps Script cannot read request headers here reliably.
  return getProp_('ALLOWED_ORIGIN', '*');
}

function buildResponse_(obj, code){
  const origin = originHeader_();
  const json = JSON.stringify(obj || {});
  const out = ContentService.createTextOutput(json);
  out.setMimeType(ContentService.MimeType.JSON);
  // Note: Apps Script Web Apps deployed as "Anyone" automatically handle CORS
  // If CORS still fails, ensure the Web App is deployed with "Who has access: Anyone"
  // and try using the deployment URL directly (not the script editor URL)
  return out;
}

function doGet(e){
  try{
    // Test authorization first
    try {
      SpreadsheetApp.getActiveSpreadsheet();
    } catch(authErr) {
      // If we can't access SpreadsheetApp, authorization is likely the issue
      return buildResponse_({ 
        ok:false, 
        error:'Script not authorized. Please: 1) Open the Apps Script editor, 2) Click Run on doGet function, 3) Authorize the script, 4) Redeploy the Web App.' 
      });
    }
    
    const action = (e.parameter.action||'').toLowerCase();
    if(action === 'reservations'){
      const date = e.parameter.date;
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')) return buildResponse_({ ok:false, error:'Invalid date' });
      const data = listReservations_(date);
      return buildResponse_(data);
    }
    return buildResponse_({ ok:false, error:'Unknown action' });
  }catch(err){
    return buildResponse_({ ok:false, error:String(err) });
  }
}

function doPost(e){
  try{
    // Test authorization first
    try {
      SpreadsheetApp.getActiveSpreadsheet();
    } catch(authErr) {
      return buildResponse_({ 
        ok:false, 
        error:'Script not authorized. Please: 1) Open the Apps Script editor, 2) Click Run on doGet function, 3) Authorize the script, 4) Redeploy the Web App.' 
      });
    }
    
    const params = e.parameter || {};
    const action = (params.action||'').toLowerCase();
    if(action === 'reserve'){
      const result = createReservation_(params);
      return buildResponse_(result);
    }
    return buildResponse_({ ok:false, error:'Unknown action' });
  }catch(err){
    return buildResponse_({ ok:false, error:String(err) });
  }
}

// Test function - run this in the Apps Script editor to check authorization
function testAuthorization(){
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if(ss) {
      Logger.log('✓ Can access active spreadsheet: ' + ss.getName());
      return 'SUCCESS: Authorization works!';
    }
  } catch(e) {
    Logger.log('✗ Cannot access active spreadsheet: ' + e.toString());
  }
  
  try {
    const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
    if(id) {
      const ss = SpreadsheetApp.openById(id);
      Logger.log('✓ Can access spreadsheet by ID: ' + ss.getName());
      return 'SUCCESS: Authorization works with SHEET_ID!';
    } else {
      Logger.log('⚠ No SHEET_ID set, but that\'s OK if script is bound to sheet');
    }
  } catch(e) {
    Logger.log('✗ Cannot access spreadsheet by ID: ' + e.toString());
  }
  
  return 'ERROR: Script needs authorization. Run this function, then authorize when prompted.';
}


function listReservations_(date){
  const sh = getSheet_();
  const last = sh.getLastRow();
  const tz = getProp_('TIMEZONE','America/Chicago');
  if(last < 2){
    return { date: date, timezone: tz, printers: allowlistPrinters_(), reservations: [] };
  }
  // Expect columns: id(0), start_date(1), start(2), end_date(3), end(4), printer(5), status(6), created_at(7), updated_at(8), name(9), contact(10), lab(11), material(12), notes(13)
  const values = sh.getRange(2,1,last-1,14).getValues();
  const out = [];
  // Parse the requested date properly
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { date: date, timezone: tz, printers: allowlistPrinters_(), reservations: [], error: 'Invalid date format' };
  }
  
  for(var i=0;i<values.length;i++){
    var row = values[i];
    var sDate = formatDate_(row[1]);
    var eDate = formatDate_(row[3]||row[1]);
    var printer = String(row[5]||'');
    
    // Parse times - handle both Date objects and strings
    var sTime = parseTime_(row[2]);
    var eTime = parseTime_(row[4]);
    
    // Skip rows with missing data
    if(!sDate || sTime === null || !eDate || eTime === null || !printer) continue;
    
    // Check if reservation overlaps with the requested date
    // A reservation overlaps with date X if: startDate <= X+1 AND endDate > X
    // (using <= for startDate to include reservations that start exactly on the next day's 00:00)
    var startDateStr = sDate;
    var endDateStr = eDate;
    
    // Ensure dates are in YYYY-MM-DD format for string comparison
    if(!/^\d{4}-\d{2}-\d{2}$/.test(startDateStr)) {
      // Try to format it if it's a Date object
      if(Object.prototype.toString.call(row[1]) === '[object Date]') {
        startDateStr = Utilities.formatDate(row[1], tz, 'yyyy-MM-dd');
      } else {
        continue;
      }
    }
    if(!/^\d{4}-\d{2}-\d{2}$/.test(endDateStr)) {
      if(Object.prototype.toString.call(row[3]) === '[object Date]') {
        endDateStr = Utilities.formatDate(row[3] || row[1], tz, 'yyyy-MM-dd');
      } else {
        continue;
      }
    }
    
    // Calculate the next day (date + 1)
    var dateParts = date.split('-');
    var dateObj = new Date(Number(dateParts[0]), Number(dateParts[1]) - 1, Number(dateParts[2]));
    dateObj.setDate(dateObj.getDate() + 1);
    var datePlusOneStr = Utilities.formatDate(dateObj, tz, 'yyyy-MM-dd');
    
    // Reservation overlaps if it starts before or on date+1 AND ends on or after date
    // For same-day reservations: startDate == date and endDate == date (still valid if time > 00:00)
    // For multi-day: startDate <= date and endDate >= date
    var overlaps = startDateStr <= datePlusOneStr && endDateStr >= date;
    
    // Edge case: if reservation ends exactly at 00:00 on the requested date, it doesn't overlap
    if(endDateStr === date && eTime === 0) {
      overlaps = false;
    }
    
    if(!overlaps) continue;
    
    // Calculate the time range for this specific day (in minutes since midnight)
    var startMin = sTime;
    var endMin = eTime;
    
    // If reservation starts before this day, start at 00:00
    if(startDateStr < date) {
      startMin = 0;
    }
    // If reservation ends after this day, end at 24:00 (1440 minutes)
    if(endDateStr >= datePlusOneStr) {
      endMin = 24 * 60;
    }
    
    // Convert to HH:mm format for display
    var startHHMM = minutesToHHMM_(startMin);
    var endHHMM = minutesToHHMM_(endMin);
    
    out.push({ printer: printer, start: startHHMM, end: endHHMM });
  }
  return { date: date, timezone: tz, printers: allowlistPrinters_(), reservations: out };
}

function parseTime_(value){
  // Handle Date objects (from Google Sheets)
  if(Object.prototype.toString.call(value) === '[object Date]'){
    var hours = value.getHours();
    var minutes = value.getMinutes();
    return hours * 60 + minutes;
  }
  // Handle string like "14:30"
  if(typeof value === 'string' && value.includes(':')){
    var parts = value.split(':');
    var h = Number(parts[0]);
    var m = Number(parts[1]);
    if(!isNaN(h) && !isNaN(m)){
      return h * 60 + m;
    }
  }
  // Handle number (minutes since midnight)
  if(typeof value === 'number' && !isNaN(value)){
    return value;
  }
  return null;
}

function minutesToHHMM_(min){
  if(isNaN(min) || min < 0) return '00:00';
  var h = Math.floor(min / 60) % 24;
  var m = Math.floor(min % 60);
  var hStr = String(h).padStart(2,'0');
  var mStr = String(m).padStart(2,'0');
  return hStr + ':' + mStr;
}

function createReservation_(p){
  var date = String(p.date||'');
  var start = String(p.start||'');
  var end = String(p.end||'');
  var endDate = String(p.endDate||'');
  var printer = String(p.printer||'');
  var name = sanitize_(String(p.name||''), 80);
  var contact = sanitize_(String(p.contact||''), 120);
  var lab = sanitize_(String(p.lab||''), 60);
  var material = sanitize_(String(p.material||''), 40);
  var notes = sanitize_(String(p.notes||''), 200);

  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok:false, error:'Invalid date' };
  if(!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return { ok:false, error:'Invalid start/end' };
  if(endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return { ok:false, error:'Invalid endDate' };
  if(!allowlistPrinters_().some(function(x){ return x===printer; })) return { ok:false, error:'Invalid printer' };
  if(!name || !contact) return { ok:false, error:'Name and contact required' };
  if(!is30min_(start) || !is30min_(end)) return { ok:false, error:'Times must be 30-min increments' };
  var tz = getProp_('TIMEZONE','America/Chicago');
  var startMin = minutes_(start);
  var endMin = minutes_(end);
  var startDT = dateTimeToDate_(date, startMin, tz);
  var endDT = dateTimeToDate_(endDate || date, endMin, tz);
  if(endDT <= startDT) return { ok:false, error:'End must be after start' };
  var maxMs = 7 * 24 * 60 * 60 * 1000; // 168h
  if(endDT.getTime() - startDT.getTime() > maxMs) return { ok:false, error:'Duration exceeds 168 hours' };

  // Overlap check against full ranges
  var existing = getAllRangesForPrinter_(printer, tz);
  var overlap = existing.some(function(range){
    return !( endDT <= range.start || startDT >= range.end );
  });
  if(overlap) return { ok:false, error:'Time overlaps an existing reservation' };

  var sh = getSheet_();
  var id = Utilities.getUuid();
  var now = new Date();
  var row = [id, date, start, (endDate || date), end, printer, 'confirmed', now, now, name, contact, lab, material, notes];
  sh.appendRow(row);
  return { ok:true, id:id };
}

function is30min_(hhmm){ return minutes_(hhmm) % 30 === 0; }
function minutes_(hhmm){ var parts = hhmm.split(':'); return Number(parts[0])*60 + Number(parts[1]); }
function sanitize_(s, max){ s = s.replace(/[\r\n\t]+/g,' ').trim(); if(s.length>max) s = s.slice(0,max); return s; }
function formatDate_(d){
  if(Object.prototype.toString.call(d)==='[object Date]'){
    return Utilities.formatDate(d, getProp_('TIMEZONE','America/Chicago'), 'yyyy-MM-dd');
  }
  return String(d);
}
function formatTime_(d, tz){
  return Utilities.formatDate(d, tz, 'HH:mm');
}
function toDateTime_(dateStr, timeStr, tz){
  var parts = timeStr.split(':');
  var y = Number(dateStr.slice(0,4));
  var m = Number(dateStr.slice(5,7)) - 1;
  var d = Number(dateStr.slice(8,10));
  var h = Number(parts[0]);
  var mi = Number(parts[1]);
  var dt = new Date();
  dt = new Date(Date.UTC(y, m, d, h, mi, 0));
  // Convert from TZ to local by adding offset difference so formatting later in TZ yields correct wall time
  var tzOffsetMin = -Utilities.formatDate(dt, tz, 'Z')/100 * 60; // not exact; workaround not needed if consistent TZ usage
  return new Date(Date.UTC(y, m, d, h, mi, 0));
}
function getAllRangesForPrinter_(printer, tz){
  var sh = getSheet_();
  var last = sh.getLastRow();
  if(last < 2) return [];
  var values = sh.getRange(2,1,last-1,14).getValues();
  var out = [];
  for(var i=0;i<values.length;i++){
    var row = values[i];
    if(String(row[5]||'') !== printer) continue;
    var sDate = formatDate_(row[1]);
    var eDate = formatDate_(row[3]||row[1]);
    var sTime = parseTime_(row[2]);
    var eTime = parseTime_(row[4]);
    if(!sDate || sTime === null || !eDate || eTime === null) continue;
    
    // Create proper Date objects for comparison
    var startDT = dateTimeToDate_(sDate, sTime, tz);
    var endDT = dateTimeToDate_(eDate, eTime, tz);
    if(endDT <= startDT) continue;
    out.push({ start:startDT, end:endDT });
  }
  return out;
}

function dateTimeToDate_(dateStr, minutesSinceMidnight, tz){
  // dateStr is YYYY-MM-DD, minutesSinceMidnight is minutes since midnight
  // Create a Date object directly - we'll use local time since we're just comparing
  var parts = dateStr.split('-');
  var y = Number(parts[0]);
  var m = Number(parts[1]) - 1; // month is 0-indexed
  var d = Number(parts[2]);
  var h = Math.floor(minutesSinceMidnight / 60);
  var mi = minutesSinceMidnight % 60;
  // Create date as UTC to avoid timezone issues in comparison
  return new Date(Date.UTC(y, m, d, h, mi, 0));
}


