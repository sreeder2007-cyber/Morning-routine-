/**
 * Family Hub — Google Apps Script backend.
 *
 * Each person who wants their calendar and email on the hub makes their own copy of this
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
const EMAIL_QUERY = 'in:inbox is:unread category:primary';
const EMAIL_SHOWN = 5;
const EMAIL_COUNT_CAP = 50;
const LIST_MAX = 150;

const PROPS = PropertiesService.getScriptProperties();

/** Run this once from the editor. It creates your key and asks for every permission. */
function setup() {
  let key = PROPS.getProperty('HUB_KEY');
  if (!key) {
    key = Utilities.getUuid().replace(/-/g, '');
    PROPS.setProperty('HUB_KEY', key);
  }
  CalendarApp.getDefaultCalendar();
  GmailApp.getInboxUnreadCount();
  if (PHOTO_FOLDER_ID) DriveApp.getFolderById(PHOTO_FOLDER_ID).getName();
  Logger.log('Your hub key: ' + key);
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (!authorized_(p.key)) return json_({ error: 'bad key' });
  const parts = String(p.parts || 'calendar,gmail,meals,list').split(',');
  const readers = { calendar: calendar_, gmail: gmail_, meals: meals_, list: list_, photos: photos_ };
  const out = { ok: true, errors: {} };
  parts.forEach(function (part) {
    if (!readers[part]) return;
    try { out[part] = readers[part](); } catch (err) { out.errors[part] = String(err.message || err); }
  });
  return json_(out);
}

/**
 * Writes: the meals note (from the iPhone Shortcut) and the family list (from the hub).
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
        calendar: cal.getName()
      });
    });
  });
  return events;
}

function gmail_() {
  const threads = GmailApp.search(EMAIL_QUERY, 0, EMAIL_COUNT_CAP);
  return {
    unread: threads.length,
    capped: threads.length >= EMAIL_COUNT_CAP,
    threads: threads.slice(0, EMAIL_SHOWN).map(function (t) {
      const msgs = t.getMessages();
      const last = msgs[msgs.length - 1];
      return {
        from: senderName_(last.getFrom()),
        subject: t.getFirstMessageSubject() || '(no subject)',
        date: t.getLastMessageDate().toISOString()
      };
    })
  };
}

function senderName_(from) {
  const m = String(from).match(/^\s*"?([^"<]+?)"?\s*</);
  return m ? m[1] : String(from).replace(/[<>]/g, '');
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
