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
 * School email → calendar: in ONE of your scripts, turn on SCHOOL_IMPORT. Every hour it
 * reads new mail from the school, has Claude pull out anything with a date, and adds those
 * to a "School" calendar, inviting the other parent so it lands on both calendars.
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

// ── School email import ──
// Turn this on in one parent's script only; if both did, every event would be added twice.
const SCHOOL_IMPORT = false;
// Mail from this domain is read (teachers and the district both send from it).
const SCHOOL_DOMAIN = 'aps.edu';
// The calendar events go on. The script creates it the first time.
const SCHOOL_CALENDAR = 'APS (from email)';
// The other parent's Gmail address(es). They're added as guests on each event so it shows on
// their calendar too. No invite email is sent.
const SHARE_WITH = [];
// Put in front of every imported title so they're easy to spot.
const SCHOOL_PREFIX = '🏫 ';
// Your Anthropic API key goes in Project Settings → Script Properties as ANTHROPIC_API_KEY,
// not here, so it never ends up in a copy of this file.
const CLAUDE_MODEL = 'claude-opus-5';

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
  if (SCHOOL_IMPORT) {
    GmailApp.search('from:' + SCHOOL_DOMAIN, 0, 1);
    schoolCalendar_();
    ScriptApp.getProjectTriggers()
      .filter(function (t) { return t.getHandlerFunction() === 'importSchoolEmails'; })
      .forEach(function (t) { ScriptApp.deleteTrigger(t); });
    ScriptApp.newTrigger('importSchoolEmails').timeBased().everyHours(1).create();
    if (!PROPS.getProperty('ANTHROPIC_API_KEY')) Logger.log('Add ANTHROPIC_API_KEY under Project Settings → Script Properties.');
    Logger.log('School import will run every hour. Run importSchoolEmails now to do the first pass.');
  }
  Logger.log('Your hub key: ' + key);
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (!authorized_(p.key)) return json_({ error: 'bad key' });
  const parts = String(p.parts || 'calendar,meals,list').split(',');
  const readers = { calendar: calendar_, meals: meals_, list: list_, photos: photos_, school: schoolStatus_ };
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

/* ── School email → calendar ─────────────────────────────────────────────────────────── */

const SCHOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['events'],
  properties: {
    events: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'date', 'end_date', 'start_time', 'end_time', 'location', 'details', 'already_on_calendar'],
        properties: {
          title: { type: 'string', description: 'Short calendar title, e.g. "Picture day" or "No school – teacher in-service".' },
          date: { type: 'string', description: 'YYYY-MM-DD' },
          end_date: { type: 'string', description: 'YYYY-MM-DD for multi-day events, else empty.' },
          start_time: { type: 'string', description: '24-hour HH:MM, or empty for all-day.' },
          end_time: { type: 'string', description: '24-hour HH:MM, or empty.' },
          location: { type: 'string' },
          details: { type: 'string', description: 'One or two sentences a parent needs: what to bring, deadlines, links.' },
          already_on_calendar: { type: 'boolean', description: 'True if this matches an event in the "already on the calendar" list.' }
        }
      }
    }
  }
};

/** Runs every hour (installed by setup). Safe to run by hand from the editor. */
function importSchoolEmails() {
  if (!SCHOOL_IMPORT) return;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  const status = { at: new Date().toISOString(), added: 0, emails: 0, error: '' };
  try {
    const apiKey = PROPS.getProperty('ANTHROPIC_API_KEY');
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is missing from Script Properties');
    const cal = schoolCalendar_();
    const seen = JSON.parse(PROPS.getProperty('SCHOOL_SEEN') || '[]');
    const started = Date.now();

    // Oldest first, so a later "update" email is read after the one it corrects.
    const messages = [];
    GmailApp.search('from:' + SCHOOL_DOMAIN + ' newer_than:21d', 0, 30).forEach(function (t) {
      t.getMessages().forEach(function (m) {
        if (seen.indexOf(m.getId()) === -1 && m.getFrom().toLowerCase().indexOf(SCHOOL_DOMAIN) !== -1) messages.push(m);
      });
    });
    messages.sort(function (a, b) { return a.getDate() - b.getDate(); });

    for (let i = 0; i < messages.length; i++) {
      // Apps Script stops a run at 6 minutes; leave the rest for next hour.
      if (Date.now() - started > 4 * 60 * 1000) break;
      const m = messages[i];
      const events = extractEvents_(apiKey, m, knownEvents_(cal));
      if (events === null) break;              // API trouble: stop and retry these next hour
      events.forEach(function (ev) { if (addSchoolEvent_(cal, ev, m)) status.added++; });
      seen.push(m.getId());
      status.emails++;
    }
    PROPS.setProperty('SCHOOL_SEEN', JSON.stringify(seen.slice(-400)));
  } catch (err) {
    status.error = String(err.message || err);
    throw err;
  } finally {
    const prev = schoolStatus_();
    status.total = (prev.total || 0) + status.added;
    PROPS.setProperty('SCHOOL_STATUS', JSON.stringify(status));
    lock.releaseLock();
  }
}

function schoolStatus_() {
  const raw = PROPS.getProperty('SCHOOL_STATUS');
  const st = raw ? JSON.parse(raw) : {};
  st.enabled = SCHOOL_IMPORT;
  return st;
}

function schoolCalendar_() {
  const found = CalendarApp.getCalendarsByName(SCHOOL_CALENDAR)[0];
  return found || CalendarApp.createCalendar(SCHOOL_CALENDAR, { selected: true, hidden: false, summary: 'Dates pulled from school email by the Family Hub script.' });
}

// Upcoming imported events, so Claude can recognize repeats ("reminder: picture day is Friday").
function knownEvents_(cal) {
  const tz = cal.getTimeZone();
  const now = new Date();
  const later = new Date(now.getTime() + 180 * 864e5);
  return cal.getEvents(now, later).slice(0, 100).map(function (e) {
    return Utilities.formatDate(e.getStartTime(), tz, 'yyyy-MM-dd') + ' ' + e.getTitle().replace(SCHOOL_PREFIX, '');
  });
}

// Returns the events Claude found (possibly none), or null when the API call itself failed.
function extractEvents_(apiKey, m, known) {
  const tz = CalendarApp.getDefaultCalendar().getTimeZone();
  const sent = m.getDate();
  const content = [];

  // Flyers and newsletters often arrive as a PDF or picture rather than in the email text.
  m.getAttachments({ includeInlineImages: false }).forEach(function (a) {
    const type = a.getContentType();
    const size = a.getSize();
    if (content.length >= 5) return;
    if (type === 'application/pdf' && size < 20 * 1024 * 1024) {
      content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: Utilities.base64Encode(a.getBytes()) } });
    } else if (/^image\/(jpeg|png|gif|webp)$/.test(type) && size < 5 * 1024 * 1024) {
      content.push({ type: 'image', source: { type: 'base64', media_type: type, data: Utilities.base64Encode(a.getBytes()) } });
    }
  });

  content.push({
    type: 'text',
    text: [
      'This email came from our child\'s school district. Find every date a parent should have on the family calendar:',
      'no-school days, early releases, school events, conferences and meetings we\'re invited to, picture day, field trips,',
      'deadlines for forms or payments, and anything the teacher asks us to do by a certain day.',
      'Skip dates that have already passed, surveys and fundraising with no real date, and district news that doesn\'t ask anything of a family.',
      'Resolve relative dates ("this Sunday", "next Monday", "tomorrow") against the date the email was sent. If the email gives no date, return no events.',
      '',
      'Today: ' + Utilities.formatDate(new Date(), tz, 'EEEE yyyy-MM-dd'),
      'Email sent: ' + Utilities.formatDate(sent, tz, 'EEEE yyyy-MM-dd HH:mm'),
      'From: ' + m.getFrom(),
      'Subject: ' + m.getSubject(),
      '',
      'Already on the calendar (mark matches already_on_calendar):',
      known.length ? known.join('\n') : '(nothing yet)',
      '',
      '--- email ---',
      m.getPlainBody()
    ].join('\n')
  });

  const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'server-side-fallback-2026-07-01'
    },
    payload: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 8000,
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHOOL_SCHEMA } },
      messages: [{ role: 'user', content: content }]
    })
  });

  const code = res.getResponseCode();
  const body = JSON.parse(res.getContentText() || '{}');
  if (code !== 200) {
    const msg = (body.error && body.error.message) || ('HTTP ' + code);
    if (code === 429 || code >= 500) { Logger.log('Claude busy, retrying next hour: ' + msg); return null; }
    throw new Error('Claude API: ' + msg);
  }
  if (body.stop_reason === 'refusal') { Logger.log('Declined: ' + m.getSubject()); return []; }
  const text = (body.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('');
  return JSON.parse(text).events;
}

function addSchoolEvent_(cal, ev, m) {
  const tz = cal.getTimeZone();
  const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  if (ev.already_on_calendar || !/^\d{4}-\d{2}-\d{2}$/.test(ev.date) || (ev.end_date || ev.date) < today) return false;

  const title = SCHOOL_PREFIX + ev.title;
  const day = Utilities.parseDate(ev.date, tz, 'yyyy-MM-dd');
  const norm = function (s) { return s.toLowerCase().replace(/[^a-z0-9]/g, ''); };
  if (cal.getEvents(day, new Date(day.getTime() + 864e5)).some(function (e) { return norm(e.getTitle()) === norm(title); })) return false;

  const opts = {
    location: ev.location || '',
    description: (ev.details ? ev.details + '\n\n' : '') + 'From "' + m.getSubject() + '" — ' + m.getFrom()
  };
  if (SHARE_WITH.length) { opts.guests = SHARE_WITH.join(','); opts.sendInvites = false; }

  const hasEnd = /^\d{4}-\d{2}-\d{2}$/.test(ev.end_date) && ev.end_date > ev.date;
  if (/^\d{2}:\d{2}$/.test(ev.start_time)) {
    const start = Utilities.parseDate(ev.date + ' ' + ev.start_time, tz, 'yyyy-MM-dd HH:mm');
    let end = /^\d{2}:\d{2}$/.test(ev.end_time)
      ? Utilities.parseDate((hasEnd ? ev.end_date : ev.date) + ' ' + ev.end_time, tz, 'yyyy-MM-dd HH:mm')
      : new Date(start.getTime() + 60 * 60000);
    if (end <= start) end = new Date(start.getTime() + 60 * 60000);
    cal.createEvent(title, start, end, opts);
  } else {
    // Noon keeps the calendar date right even if the script's time zone differs from the calendar's.
    const noon = new Date(day.getTime() + 12 * 3600e3);
    if (hasEnd) {
      const last = Utilities.parseDate(ev.end_date, tz, 'yyyy-MM-dd');
      cal.createAllDayEvent(title, noon, new Date(last.getTime() + 36 * 3600e3), opts);
    } else {
      cal.createAllDayEvent(title, noon, opts);
    }
  }
  return true;
}
