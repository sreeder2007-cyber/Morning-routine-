/**
 * Family Hub — Google Apps Script backend.
 *
 * Each person who wants their calendar on the hub makes their own copy of this
 * script (script.google.com → New project → paste this file). It runs as that person, so
 * nobody shares a password and nothing is stored anywhere but their own Google account.
 *
 * Setup (once per person — full walkthrough in README.md):
 *   1. Paste this file, then fill in PHOTO_FOLDER_ID below if you want photos (optional).
 *   2. Run `setup` from the toolbar, allow the permissions, and copy the key from the log.
 *   3. Deploy → New deployment → Web app. Execute as: Me. Who has access: Anyone.
 *   4. Put the /exec URL and the key into the hub's Settings.
 *
 * "Anyone" only means the URL answers without a Google sign-in; every request must carry
 * the key, and a request without it gets nothing back.
 *
 * Photos of flyers and schedules sent from the hub's 📷 button are saved to a "Family Hub
 * Inbox" folder in this account's Drive. A scheduled Claude task reads that folder (and
 * APS email) and puts the dates on the calendar — see README.md.
 */

// Optional: the ID of a Google Drive folder of family photos (the part of the folder's URL
// after /folders/). Share that folder as "Anyone with the link can view" so the tablet can
// load the images. Leave empty for no photos.
const PHOTO_FOLDER_ID = '';

// Calendars to show. Empty means every calendar that's checked in your Google Calendar
// sidebar (yours, shared family calendars, holidays, birthdays). Otherwise list IDs from
// Calendar settings → "Integrate calendar" → Calendar ID, e.g. ['primary', 'abc@group.calendar.google.com'].
const CALENDAR_IDS = [];

const DAYS_AHEAD = 7;
const LIST_MAX = 150;

// Where photos from the hub's 📷 button go. The scheduled Claude task reads new files here
// and moves each one into the Done subfolder after adding its dates to the calendar.
const INBOX_FOLDER = 'Family Hub Inbox';

const PROPS = PropertiesService.getScriptProperties();

/** Run this once from the editor. It creates your key and asks for every permission. */
function setup() {
  let key = PROPS.getProperty('HUB_KEY');
  if (!key) {
    key = Utilities.getUuid().replace(/-/g, '');
    PROPS.setProperty('HUB_KEY', key);
  }
  CalendarApp.getDefaultCalendar();
  if (PHOTO_FOLDER_ID) DriveApp.getFolderById(PHOTO_FOLDER_ID).getName();
  inboxFolder_();
  Logger.log('Your hub key: ' + key);
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (!authorized_(p.key)) return json_({ error: 'bad key' });
  const parts = String(p.parts || 'calendar,meals,list').split(',');
  const readers = { calendar: calendar_, meals: meals_, list: list_, photos: photos_ };
  const out = { ok: true, errors: {} };
  parts.forEach(function (part) {
    if (!readers[part]) return;
    try { out[part] = readers[part](); } catch (err) { out.errors[part] = String(err.message || err); }
  });
  return json_(out);
}

/**
 * Writes: the meals note (from the iPhone Shortcut), the family list and photo uploads (from the hub).
 * Body is JSON: { key, action, ... }.
 */
function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ error: 'bad json' }); }
  if (!authorized_(body.key)) return json_({ error: 'bad key' });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (body.action === 'meals') {
      const text = String(body.text || '').slice(0, 8000);
      PROPS.setProperty('MEALS', JSON.stringify({ text: text, at: new Date().toISOString() }));
      return json_({ ok: true, meals: meals_() });
    }
    if (body.action === 'addEvent') {
      try { addEvent_(body); } catch (err) { return json_({ error: String(err.message || err) }); }
      return json_({ ok: true, calendar: calendar_() });
    }
    if (body.action === 'upload') {
      const bytes = Utilities.base64Decode(String(body.data || ''));
      if (!bytes.length || bytes.length > 15 * 1024 * 1024) return json_({ error: 'bad photo' });
      // The note rides in the file name so the Claude task sees it next to the picture.
      const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HHmm');
      const note = String(body.note || '').replace(/[\\/:*?"<>|\n]+/g, ' ').trim().slice(0, 120);
      const name = stamp + (note ? ' — ' + note : '') + '.jpg';
      const file = inboxFolder_().createFile(Utilities.newBlob(bytes, 'image/jpeg', name));
      return json_({ ok: true, name: file.getName() });
    }
    if (/^list/.test(body.action)) {
      const list = applyListOp_(list_(), body);
      PROPS.setProperty('LIST', JSON.stringify(list));
      return json_({ ok: true, list: list });
    }
    return json_({ error: 'unknown action' });
  } finally {
    lock.releaseLock();
  }
}

function authorized_(key) {
  const real = PROPS.getProperty('HUB_KEY');
  return !!real && key === real;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function calendar_() {
  const tz = Session.getScriptTimeZone();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + DAYS_AHEAD);

  const cals = CALENDAR_IDS.length
    ? CALENDAR_IDS.map(function (id) { return id === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(id); }).filter(Boolean)
    : CalendarApp.getAllCalendars().filter(function (c) { return c.isSelected() && !c.isHidden(); });

  const events = [];
  cals.forEach(function (cal) {
    cal.getEvents(start, end).forEach(function (ev) {
      const allDay = ev.isAllDayEvent();
      events.push({
        id: ev.getId(),
        title: ev.getTitle() || '(busy)',
        allDay: allDay,
        // All-day events travel as calendar dates (end is exclusive) so they can't shift a
        // day when the tablet's time zone differs from the script's.
        start: allDay ? Utilities.formatDate(ev.getAllDayStartDate(), tz, 'yyyy-MM-dd') : ev.getStartTime().toISOString(),
        end: allDay ? Utilities.formatDate(ev.getAllDayEndDate(), tz, 'yyyy-MM-dd') : ev.getEndTime().toISOString(),
        location: ev.getLocation() || '',
        private: ev.getVisibility() === CalendarApp.Visibility.PRIVATE,
        calendar: cal.getName()
      });
    });
  });
  return events;
}

function meals_() {
  const raw = PROPS.getProperty('MEALS');
  return raw ? JSON.parse(raw) : { text: '', at: null };
}

function list_() {
  const raw = PROPS.getProperty('LIST');
  return raw ? JSON.parse(raw) : [];
}

// Mirrors applyListOp in hub.html, which applies the same change optimistically.
function applyListOp_(list, op) {
  const now = Date.now();
  if (op.action === 'listAdd' && op.text) {
    if (!list.some(function (i) { return i.id === op.id; })) {
      list.push({ id: String(op.id || now), text: String(op.text).slice(0, 200), done: false, at: now });
    }
  } else if (op.action === 'listToggle') {
    list.forEach(function (i) { if (i.id === op.id) { i.done = !i.done; i.at = now; } });
  } else if (op.action === 'listClearDone') {
    list = list.filter(function (i) { return !i.done; });
  }
  // Checked-off items drop away on their own after two days.
  list = list.filter(function (i) { return !i.done || now - i.at < 2 * 864e5; });
  return list.slice(-LIST_MAX);
}

function photos_() {
  if (!PHOTO_FOLDER_ID) return [];
  const cache = CacheService.getScriptCache();
  const hit = cache.get('photos');
  if (hit) return JSON.parse(hit);
  const ids = [];
  const files = DriveApp.getFolderById(PHOTO_FOLDER_ID).getFiles();
  while (files.hasNext() && ids.length < 1000) {
    const f = files.next();
    if (/^image\//.test(f.getMimeType())) ids.push(f.getId());
  }
  cache.put('photos', JSON.stringify(ids), 3600);
  return ids;
}

// An event typed on the hub. Created through the Calendar API rather than CalendarApp so it can
// be marked private and so invites go only to work addresses (Outlook and other non-Google
// calendars) while family Gmail guests just get it on their calendar without an email.
function addEvent_(ev) {
  const cal = CalendarApp.getDefaultCalendar();
  const tz = cal.getTimeZone();
  const title = String(ev.title || '').trim().slice(0, 200);
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(ev.date)) throw new Error('bad event');
  const isTime = function (t) { return /^\d{2}:\d{2}$/.test(t || ''); };
  const isEmail = function (g) { return /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(g); };

  const body = { summary: title };
  if (ev.location) body.location = String(ev.location).slice(0, 200);
  if (ev.private) body.visibility = 'private';
  // Family members are regular guests; work addresses are optional, so the invite reads as
  // an FYI hold on the work calendar rather than a meeting to accept.
  const attendees = (ev.guests || []).filter(isEmail).map(function (g) { return { email: g }; })
    .concat((ev.workGuests || []).filter(isEmail).map(function (g) { return { email: g, optional: true }; }));
  if (attendees.length) body.attendees = attendees;

  if (isTime(ev.start)) {
    // No end (or one before the start): an hour long, stopping at midnight.
    const oneHour = function (t) {
      const m = Math.min(+t.slice(0, 2) * 60 + +t.slice(3) + 60, 23 * 60 + 59);
      return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + m % 60).slice(-2);
    };
    const end = isTime(ev.end) && ev.end > ev.start ? ev.end : oneHour(ev.start);
    body.start = { dateTime: ev.date + 'T' + ev.start + ':00', timeZone: tz };
    body.end = { dateTime: ev.date + 'T' + end + ':00', timeZone: tz };
  } else {
    const next = new Date(Utilities.parseDate(ev.date, 'UTC', 'yyyy-MM-dd').getTime() + 864e5);
    body.start = { date: ev.date };
    body.end = { date: Utilities.formatDate(next, 'UTC', 'yyyy-MM-dd') };
  }

  const res = UrlFetchApp.fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=externalOnly', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    const err = JSON.parse(res.getContentText() || '{}').error;
    throw new Error('Calendar: ' + ((err && err.message) || res.getResponseCode()));
  }
}

function inboxFolder_() {
  const found = DriveApp.getFoldersByName(INBOX_FOLDER);
  const folder = found.hasNext() ? found.next() : DriveApp.createFolder(INBOX_FOLDER);
  if (!folder.getFoldersByName('Done').hasNext()) folder.createFolder('Done');
  return folder;
}
