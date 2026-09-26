/**
 * Family Hub — Google Apps Script backend.
 *
 * Each person who wants their calendar on the hub makes their own copy of this
 * script (script.google.com → New project → paste this file). It runs as that person, so
 * nobody shares a password and nothing is stored anywhere but their own Google account.
 *
 * Setup (once per person — full walkthrough in README.md):
 *   1. Paste this file. (Photos are set later from the hub's Settings; nothing to edit here.)
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

// Photos are normally set from the hub: Settings → your name → Photo album. The two values
// below are only a fallback if you'd rather type them here.
//
// Optional: the ID of a Google Drive folder of family photos (the part of the folder's URL
// after /folders/). Share that folder as "Anyone with the link can view" so the tablet can
// load the images. Leave empty for no photos.
const PHOTO_FOLDER_ID = '';

// Optional: an iCloud Shared Album for the photo frame. In the Photos app on an iPhone, open the
// shared album → People (the person icon) → turn on Public Website → Share Link, and paste that
// link here, e.g. 'https://www.icloud.com/sharedalbum/#B0aBcDeFgHiJkL'. Anyone in the album can
// add pictures from their phone and they appear on the hub within the hour. Videos are skipped.
const ICLOUD_ALBUM = '';

// Calendars to show. Empty means every calendar that's checked in your Google Calendar
// sidebar (yours, shared family calendars, holidays, birthdays). Otherwise list IDs from
// Calendar settings → "Integrate calendar" → Calendar ID, e.g. ['primary', 'abc@group.calendar.google.com'].
const CALENDAR_IDS = [];

const DAYS_AHEAD = 7;
const LIST_MAX = 150;
// Past days of the meal plan kept (so "what did we have last Tuesday" still works).
const PLAN_KEEP_DAYS = 14;

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
  DriveApp.getRootFolder();
  inboxFolder_();
  Logger.log('Your hub key: ' + key);
}

/**
 * Run this if the tablet is lost or a setup link went somewhere it shouldn't. The old key
 * stops working at once; put the new one into the hub's Settings.
 */
function newKey() {
  const key = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  PROPS.setProperty('HUB_KEY', key);
  Logger.log('Your new hub key: ' + key);
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (!authorized_(p.key)) return json_({ error: 'bad key' });
  const parts = String(p.parts || 'calendar,meals,list').split(',');
  const readers = { calendar: calendar_, meals: meals_, list: list_, photos: photos_, plan: plan_, upcoming: upcoming_, kid: kid_ };
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
    if (body.action === 'photoSource') {
      try { return json_(Object.assign({ ok: true }, setPhotoSource_(body.link))); }
      catch (err) { return json_({ error: String(err.message || err) }); }
    }
    if (body.action === 'addEvent') {
      let added;
      try { added = addEvent_(body); } catch (err) { return json_({ error: String(err.message || err) }); }
      const warning = added.workSkipped
        ? 'Added, but the work invites weren\'t sent. To send them, turn on the Google Calendar API in the script (Services → + → Google Calendar API) and publish a new version.'
        : '';
      return json_({ ok: true, calendar: calendar_(), warning: warning });
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
    if (/^kid/.test(body.action)) {
      try { applyKidOp_(body); } catch (err) { return json_({ error: String(err.message || err) }); }
      return json_({ ok: true, kid: kid_() });
    }
    if (/^(plan|fav)/.test(body.action)) {
      try { applyPlanOp_(body); } catch (err) { return json_({ error: String(err.message || err) }); }
      return json_({ ok: true, plan: plan_() });
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

function calendarsToShow_() {
  return CALENDAR_IDS.length
    ? CALENDAR_IDS.map(function (id) { return id === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(id); }).filter(Boolean)
    : CalendarApp.getAllCalendars().filter(function (c) { return c.isSelected() && !c.isHidden(); });
}

function eventsBetween_(start, end, keep) {
  const tz = Session.getScriptTimeZone();
  const events = [];
  calendarsToShow_().forEach(function (cal) {
    cal.getEvents(start, end).forEach(function (ev) {
      if (keep && !keep(ev.getTitle() || '')) return;
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

function calendar_() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return eventsBetween_(start, new Date(start.getTime() + DAYS_AHEAD * 864e5));
}

// Big events further ahead, for the countdowns on Paul's view. Filtered here so only a
// handful of events travel (the hub decides which three to show).
const COUNTDOWN_DAYS = 150;
const MAJOR_EVENT = /⭐|🎂|birthday|no school|home day|\bbreak\b|vacation|\btrip\b|halloween|thanksgiving|christmas day|new year'?s day|easter sunday|valentine|independence day/i;
function upcoming_() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return eventsBetween_(start, new Date(start.getTime() + COUNTDOWN_DAYS * 864e5), function (t) { return MAJOR_EVENT.test(t); }).slice(0, 80);
}

/* ── Paul's jobs ──
 * KID_TASKS → [{id, icon, label, when: daily|school|home|date, date}]
 * KID_DONE:yyyy-MM-dd → [task ids checked off that day], kept for a week. */
function kid_() {
  const all = PROPS.getProperties();
  const done = {};
  Object.keys(all).forEach(function (k) { if (k.indexOf('KID_DONE:') === 0) done[k.slice(9)] = JSON.parse(all[k]); });
  return { tasks: JSON.parse(all.KID_TASKS || 'null'), done: done };
}

function applyKidOp_(op) {
  const clean = function (v, n) { return String(v || '').replace(/\s+/g, ' ').trim().slice(0, n); };
  if (op.action === 'kidTasks') {
    const tasks = (op.tasks || []).slice(0, 30).map(function (t) {
      return {
        id: clean(t.id, 24).replace(/[^\w-]/g, ''),
        icon: clean(t.icon, 12),
        label: clean(t.label, 40),
        when: ['daily', 'school', 'home', 'date'].indexOf(t.when) === -1 ? 'daily' : t.when,
        date: /^\d{4}-\d{2}-\d{2}$/.test(t.date || '') ? t.date : ''
      };
    }).filter(function (t) { return t.id && t.label; });
    PROPS.setProperty('KID_TASKS', JSON.stringify(tasks));
  } else if (op.action === 'kidDone') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(op.date)) throw new Error('bad date');
    const key = 'KID_DONE:' + op.date;
    const ids = JSON.parse(PROPS.getProperty(key) || '[]').filter(function (id) { return id !== op.id; });
    if (op.done) ids.push(clean(op.id, 24));
    PROPS.setProperty(key, JSON.stringify(ids.slice(-40)));
    const cutoff = Utilities.formatDate(new Date(Date.now() - 7 * 864e5), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    PROPS.getKeys().forEach(function (k) { if (k.indexOf('KID_DONE:') === 0 && k.slice(9) < cutoff) PROPS.deleteProperty(k); });
  } else {
    throw new Error('unknown action');
  }
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
  if (op.action === 'listAddMany') {
    (op.items || []).slice(0, 60).forEach(function (it) {
      if (it && it.text && !list.some(function (i) { return i.id === it.id; })) {
        list.push({ id: String(it.id || now + Math.random()), text: String(it.text).slice(0, 200), done: false, at: now });
      }
    });
  } else if (op.action === 'listAdd' && op.text) {
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

// The album chosen in the hub's Settings wins over the constants above.
function photoSource_() {
  return {
    icloud: PROPS.getProperty('ICLOUD_ALBUM') || ICLOUD_ALBUM,
    folder: PROPS.getProperty('PHOTO_FOLDER_ID') || PHOTO_FOLDER_ID
  };
}

function photos_() {
  const src = photoSource_();
  let out = [];
  if (src.folder) out = out.concat(drivePhotos_(src.folder));
  if (src.icloud) out = out.concat(icloudPhotos_(src.icloud));
  return out;
}

// Set from the hub: an iCloud Shared Album link, a Google Drive folder link, or blank to turn
// photos off. The new album is read once straight away so a bad link is reported, not saved.
function setPhotoSource_(link) {
  link = String(link || '').trim();
  const folder = link.match(/drive\.google\.com\/(?:drive\/(?:u\/\d+\/)?folders\/|open\?id=)([\w-]{10,})/);
  CacheService.getScriptCache().remove('photos');
  if (!link) {
    PROPS.deleteProperty('ICLOUD_ALBUM');
    PROPS.deleteProperty('PHOTO_FOLDER_ID');
    return { kind: 'none', count: 0 };
  }
  if (/icloud\.com\/sharedalbum\/#[A-Za-z0-9]{10,}/.test(link)) {
    const count = icloudPhotos_(link).length;
    PROPS.setProperty('ICLOUD_ALBUM', link);
    PROPS.deleteProperty('PHOTO_FOLDER_ID');
    return { kind: 'icloud', count: count };
  }
  if (folder) {
    const count = drivePhotos_(folder[1]).length;
    PROPS.setProperty('PHOTO_FOLDER_ID', folder[1]);
    PROPS.deleteProperty('ICLOUD_ALBUM');
    return { kind: 'drive', count: count };
  }
  throw new Error('That isn\'t an iCloud Shared Album link (…icloud.com/sharedalbum/#…) or a Google Drive folder link');
}

function drivePhotos_(folderId) {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('photos');
  if (hit) return JSON.parse(hit);
  const ids = [];
  const files = DriveApp.getFolderById(folderId).getFiles();
  while (files.hasNext() && ids.length < 1000) {
    const f = files.next();
    if (/^image\//.test(f.getMimeType())) ids.push(f.getId());
  }
  cache.put('photos', JSON.stringify(ids), 3600);
  return ids;
}

// Reads a public iCloud Shared Album the way Apple's own album web page does. Apple doesn't
// document these two calls, so if Apple changes them this is the place to look. Returns
// full-size image links; Apple signs them for a limited time, so the hub re-asks regularly.
function icloudPhotos_(link) {
  const token = String(link).split('#').pop().split(';')[0].trim();
  if (!/^[A-Za-z0-9]{10,}$/.test(token)) throw new Error('ICLOUD_ALBUM should be the album link ending in #B0…');
  let host = 'p23-sharedstreams.icloud.com';
  const call = function (path, body) {
    for (let tries = 0; tries < 3; tries++) {
      const res = UrlFetchApp.fetch('https://' + host + '/' + token + '/sharedstreams/' + path, {
        method: 'post', contentType: 'text/plain', payload: JSON.stringify(body), muteHttpExceptions: true
      });
      const code = res.getResponseCode();
      // Albums live on different Apple servers; the first answer names the right one.
      if (code === 330) { host = JSON.parse(res.getContentText())['X-Apple-MMe-Host'] || host; continue; }
      if (code === 404) throw new Error('iCloud album not found. Is Public Website turned on for it?');
      if (code !== 200) throw new Error('iCloud album: HTTP ' + code);
      return JSON.parse(res.getContentText());
    }
    throw new Error('iCloud album: too many redirects');
  };

  const stream = call('webstream', { streamCtag: null });
  const picks = [];
  (stream.photos || []).forEach(function (p) {
    if (p.mediaAssetType === 'video') return;
    // Each photo comes in several sizes; take the biggest one up to 2560px wide.
    const sizes = Object.keys(p.derivatives || {}).map(function (k) { return p.derivatives[k]; })
      .filter(function (d) { return d && d.checksum && +d.width; })
      .sort(function (a, b) { return +a.width - +b.width; });
    const fit = sizes.filter(function (d) { return +d.width <= 2560; });
    const pick = fit.length ? fit[fit.length - 1] : sizes[0];
    if (pick) picks.push({ guid: p.photoGuid, checksum: pick.checksum });
  });

  const urls = [];
  for (let i = 0; i < picks.length && i < 500; i += 25) {
    const batch = picks.slice(i, i + 25);
    const assets = call('webasseturls', { photoGuids: batch.map(function (b) { return b.guid; }) });
    batch.forEach(function (b) {
      const item = assets.items && assets.items[b.checksum];
      if (item && item.url_location && item.url_path) urls.push('https://' + item.url_location + item.url_path);
    });
  }
  return urls;
}

// An event typed on the hub. Two ways to create it:
//  • With the Google Calendar API turned on (script editor → Services → + → Google Calendar API):
//    work addresses get an optional invite by email, family Gmail guests get the event quietly.
//  • Without it, Google's basic calendar tools: the event is still created (private during work
//    hours, family added quietly), but work calendars can't be invited, and the hub says so.
function addEvent_(ev) {
  const cal = CalendarApp.getDefaultCalendar();
  const tz = cal.getTimeZone();
  const title = String(ev.title || '').trim().slice(0, 200);
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(ev.date)) throw new Error('bad event');
  const isTime = function (t) { return /^\d{2}:\d{2}$/.test(t || ''); };
  const isEmail = function (g) { return /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(g); };
  const family = (ev.guests || []).filter(isEmail);
  const work = (ev.workGuests || []).filter(isEmail);
  const location = String(ev.location || '').slice(0, 200);

  // No end (or one before the start): an hour long, stopping at midnight.
  const oneHour = function (t) {
    const m = Math.min(+t.slice(0, 2) * 60 + +t.slice(3) + 60, 23 * 60 + 59);
    return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + m % 60).slice(-2);
  };
  const timed = isTime(ev.start);
  const endTime = timed ? (isTime(ev.end) && ev.end > ev.start ? ev.end : oneHour(ev.start)) : '';

  let apiError = '';
  if (typeof Calendar !== 'undefined' && Calendar.Events) {
    const body = { summary: title };
    if (location) body.location = location;
    if (ev.private) body.visibility = 'private';
    const attendees = family.map(function (g) { return { email: g }; })
      .concat(work.map(function (g) { return { email: g, optional: true }; }));
    if (attendees.length) body.attendees = attendees;
    if (timed) {
      body.start = { dateTime: ev.date + 'T' + ev.start + ':00', timeZone: tz };
      body.end = { dateTime: ev.date + 'T' + endTime + ':00', timeZone: tz };
    } else {
      const next = new Date(Utilities.parseDate(ev.date, 'UTC', 'yyyy-MM-dd').getTime() + 864e5);
      body.start = { date: ev.date };
      body.end = { date: Utilities.formatDate(next, 'UTC', 'yyyy-MM-dd') };
    }
    try {
      Calendar.Events.insert(body, 'primary', { sendUpdates: 'externalOnly' });
      return { workInvited: work.length > 0, workSkipped: false };
    } catch (err) {
      apiError = String(err.message || err);   // fall through to the basic tools below
    }
  }

  const opts = { location: location };
  if (family.length) { opts.guests = family.join(','); opts.sendInvites = false; }
  let created;
  if (timed) {
    created = cal.createEvent(title,
      Utilities.parseDate(ev.date + ' ' + ev.start, tz, 'yyyy-MM-dd HH:mm'),
      Utilities.parseDate(ev.date + ' ' + endTime, tz, 'yyyy-MM-dd HH:mm'), opts);
  } else {
    // Noon keeps the calendar date right even if the script's time zone differs from the calendar's.
    created = cal.createAllDayEvent(title, new Date(Utilities.parseDate(ev.date, tz, 'yyyy-MM-dd').getTime() + 12 * 3600e3), opts);
  }
  if (ev.private) created.setVisibility(CalendarApp.Visibility.PRIVATE);
  return { workInvited: false, workSkipped: work.length > 0, apiError: apiError };
}

/* ── Meal plan ──
 * Each planned day is its own property (PLAN:yyyy-MM-dd → {b, l, d}) and so is each favorite
 * meal (FAV:name → {name, items}), which keeps every value far below the 9 KB property limit. */
function plan_() {
  const all = PROPS.getProperties();
  const days = {};
  const favs = [];
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('PLAN:') === 0) days[k.slice(5)] = JSON.parse(all[k]);
    else if (k.indexOf('FAV:') === 0) favs.push(JSON.parse(all[k]));
  });
  favs.sort(function (a, b) { return a.name.localeCompare(b.name); });
  return { days: days, favs: favs };
}

// Mirrors applyPlanOp in hub.html, which applies the same change optimistically.
function applyPlanOp_(op) {
  const clean = function (v, n) { return String(v || '').replace(/\s+/g, ' ').trim().slice(0, n); };
  if (op.action === 'planSet') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(op.date) || ['b', 'l', 'd'].indexOf(op.slot) === -1) throw new Error('bad plan');
    const key = 'PLAN:' + op.date;
    const day = JSON.parse(PROPS.getProperty(key) || '{}');
    day[op.slot] = clean(op.text, 120);
    if (!day.b && !day.l && !day.d) PROPS.deleteProperty(key);
    else PROPS.setProperty(key, JSON.stringify({ b: day.b || '', l: day.l || '', d: day.d || '' }));
    // Drop days older than two weeks.
    const cutoff = Utilities.formatDate(new Date(Date.now() - PLAN_KEEP_DAYS * 864e5), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    PROPS.getKeys().forEach(function (k) { if (k.indexOf('PLAN:') === 0 && k.slice(5) < cutoff) PROPS.deleteProperty(k); });
  } else if (op.action === 'favSave') {
    const fav = cleanFav_(op);
    if (!fav) throw new Error('bad favorite');
    if (op.oldName && op.oldName.toLowerCase() !== fav.name.toLowerCase()) PROPS.deleteProperty('FAV:' + clean(op.oldName, 60).toLowerCase());
    PROPS.setProperty('FAV:' + fav.name.toLowerCase(), JSON.stringify(fav));
  } else if (op.action === 'planImport') {
    // One request for a whole pasted note: dinners by date, plus favorites merged into any
    // that already exist (existing ingredients kept; a missing link or cook filled in).
    const days = op.days || {};
    Object.keys(days).slice(0, 60).forEach(function (date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !clean(days[date], 120)) return;
      const key = 'PLAN:' + date;
      const day = JSON.parse(PROPS.getProperty(key) || '{}');
      PROPS.setProperty(key, JSON.stringify({ b: day.b || '', l: day.l || '', d: clean(days[date], 120) }));
    });
    (op.favs || []).slice(0, 150).forEach(function (f) {
      const fav = cleanFav_(f);
      if (!fav) return;
      const key = 'FAV:' + fav.name.toLowerCase();
      const old = JSON.parse(PROPS.getProperty(key) || 'null');
      if (old) {
        fav.name = old.name;
        fav.items = old.items && old.items.length ? old.items : fav.items;
        fav.link = old.link || fav.link;
        fav.cooks = (old.cooks || []).concat(fav.cooks.filter(function (c) { return (old.cooks || []).indexOf(c) === -1; }));
      }
      PROPS.setProperty(key, JSON.stringify(fav));
    });
  } else if (op.action === 'favDelete') {
    PROPS.deleteProperty('FAV:' + clean(op.name, 60).toLowerCase());
  } else {
    throw new Error('unknown action');
  }
}

function cleanFav_(f) {
  const clean = function (v, n) { return String(v || '').replace(/\s+/g, ' ').trim().slice(0, n); };
  const name = clean(f && f.name, 60);
  if (!name) return null;
  const link = clean(f.link, 500);
  return {
    name: name,
    link: /^https?:\/\/\S+$/.test(link) ? link : '',
    cooks: (f.cooks || []).map(function (c) { return clean(c, 40); }).filter(Boolean).slice(0, 6),
    items: (f.items || []).map(function (i) { return clean(i, 80); }).filter(Boolean).slice(0, 40)
  };
}

function inboxFolder_() {
  const found = DriveApp.getFoldersByName(INBOX_FOLDER);
  const folder = found.hasNext() ? found.next() : DriveApp.createFolder(INBOX_FOLDER);
  if (!folder.getFoldersByName('Done').hasNext()) folder.createFolder('Done');
  return folder;
}
