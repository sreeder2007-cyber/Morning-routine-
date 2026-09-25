# Morning-routine-

Single-file pages, no build step, no app store. Open one and add it to the home screen.

| File | Who it's for | What it does |
| --- | --- | --- |
| `index.html` | Paul | The morning routine: timed steps, voice prompts, ball jar. |
| `tracker.html` | Mom and Dad | Behavior data: non-compliance, toileting accidents, tantrums. |
| `hub.html` | The whole family | A Skylight-style wall display: week calendar with school dates from APS email, today's meals, a shared list, and a photo frame. |

## tracker.html

Three counts, one tap each. Tap **Non-compliance**, **Accident**, or **Tantrum** and it's
recorded with the time — nothing else to confirm, and a six-second Undo if you miss.

Optional, above the three buttons: **Time an instruction** starts a 10-second countdown for
the latency window in the non-compliance definition. Tap **Paul started** and nothing is
recorded; let it run out and non-compliance is logged automatically, timestamped at the
10-second mark, with a buzz so you don't have to watch the screen. The episode then stays
open until you mark that he began the task or asked for help or a break, which records how
long it lasted, followed by a 30-second engagement clock showing when a new occurrence may
be counted. Ignore all of this and the one-tap button still works.

Also here: day-by-day history, a 7-day chart per behavior, entries that can be retimed,
annotated, or deleted, "+ Add earlier" for backdating, and **Copy weekly summary** /
**Copy CSV** for pasting into an email to the BCBA.

Latency (10s), engagement (30s), the child's name, and who's logging are all in Settings.

### On the home screen

`manifest.json` and `icon-192/512.png` make it install as a standalone app.
**iPhone:** open the page in Safari (it has to be Safari) → Share → Add to Home Screen.
**Android:** open it in Chrome → menu → Install app.

On iOS the installed app keeps its own storage, separate from Safari's — so install it
first and then log only from the home-screen icon, or the two copies drift apart. When a
shared link arrives by text, copy it and paste it into **Merge a shared log** inside the
app rather than opening it in the browser.

### One-tap buttons

`tracker.html#add=nc`, `#add=toilet`, and `#add=tantrum` record one entry the moment the
page opens and show a full-screen confirmation with an Undo. The hash is cleared before
anything is written, so a refresh can't log twice, and the same handler runs on
`hashchange` so it works whether the app was closed or already open.

`manifest.json` maps those three URLs to app shortcuts — on Android, long-press the icon
to get all three, and drag any one of them onto the home screen as its own button. iOS has
no equivalent, so the way to get buttons there is the Shortcuts app: one "Open URLs"
shortcut per behavior, surfaced through the Shortcuts widget, Back Tap, or the Action
Button. Those open the default browser, so on iPhone pick one home for the data — the
installed app, or Safari with widgets, not both.

### Two phones, no accounts

Entries live in each phone's own browser storage. **Share my log** packs that phone's last
30 days into a link — a few hundred characters for a typical day — that you text to the
other phone. Opening it offers to merge; **Merge a shared log** does the same from a pasted
link. A phone only ever ships the entries it recorded itself, and merged entries keep stable
identities, so re-sharing updates the log instead of duplicating it and neither phone can
overwrite the other's records.

## hub.html — Family Hub

A kitchen display for an Android tablet. Across the top: clock, date, and weather. Below:
the next seven days from both Google Calendars (color-coded per person, with shared events
marked for both), including dates pulled automatically from APS emails. Down the side:
today's meals from the Apple Note and a family shopping/to-do list anyone can add to.
The hub never shows email itself. After ten idle minutes it turns into a photo frame showing the
clock and the next event. Overnight it goes dark. A tap wakes it every time.

Tap **Try it with sample data** on the first screen to see it before connecting anything.

### 1. The Google script (each of you, ~5 minutes)

Google won't let a web page read your calendar without an app of your own, so each of you
runs `hub-script.gs` as a small private web app under your own account. Nobody shares a
password, and it's free.

1. Go to [script.google.com](https://script.google.com) → **New project**. Delete what's
   there, paste in all of `hub-script.gs`, and name it "Family Hub".
2. For photos, fill in `PHOTO_FOLDER_ID` (see step 3). You can skip this and add it later.
3. Choose **setup** in the function menu at the top and press **Run**. Allow the
   permissions (Google warns that the app is unverified: it's your own script, so choose
   **Advanced → Go to Family Hub**). Copy the **key** it prints in the log.
4. **Deploy → New deployment →** gear icon **→ Web app**. *Execute as:* **Me**. *Who has
   access:* **Anyone**. Deploy and copy the URL that ends in `/exec`.
5. On the hub: ⚙️ → **+ Add a person** → name, color, URL, key → **Test connection** →
   **Save**.

"Anyone" means the URL answers without a Google sign-in. Every request still needs the
key, and without it the script returns nothing. Treat the URL and key like a password.

If you edit the script later, go to **Deploy → Manage deployments → ✏️ → Version: New
version**. The URL stays the same.

Only calendars that are checked in your Google Calendar sidebar show up. To pick specific
ones, list their IDs in `CALENDAR_IDS`.

### 1b. APS emails → both calendars (one of you, ~5 minutes)

Every hour, the script reads new mail from `@aps.edu` (the district and teachers). Claude
reads each email, including attached PDF newsletters and flyers, and pulls out anything
with a date a parent needs: no-school days, early releases, picture day, conferences,
field trips, form and payment deadlines. It understands relative dates like "this Sunday".
Each date becomes an event on a new **APS (from email)** calendar, with a 🏫 in front of the
title and the original email's subject in the description. The other parent is added as a
guest, so the event also appears on their calendar. No invite email is sent.

Do this in **one** script only: the one whose Gmail gets APS mail (if you both get it, pick
either). In that copy of `hub-script.gs`:

1. Set `SCHOOL_IMPORT = true`, and put the other parent's Gmail address in `SHARE_WITH`,
   e.g. `const SHARE_WITH = ['name@gmail.com'];`.
2. Get an API key at [console.anthropic.com](https://console.anthropic.com) (add a few
   dollars of credit; a plain school email costs a cent or two to read, a long PDF
   newsletter closer to 15–20¢). In the script
   editor, open **Project Settings → Script Properties → Add**, name it
   `ANTHROPIC_API_KEY`, and paste the key. Keeping it there means it's never in the code.
3. Run **setup** again and allow the new permissions. This creates the calendar and the
   hourly schedule. Then run **importSchoolEmails** once to catch up on the last three weeks.
4. **Deploy → Manage deployments → ✏️ → New version** so the hub sees the change.

Emails are read only once, dates that have already passed are skipped, and an event that's
already on the calendar isn't added again, even when a later reminder email repeats it. To
remove everything it has added, delete the **APS (from email)** calendar; the guest copies go
with it. If something breaks (a used-up API key, for example), the hub's status line
shows it, and Google emails you the failed run. To watch a different school or sender,
change `SCHOOL_DOMAIN`.

### 2. The meals note (your wife's iPhone, ~3 minutes)

Apple Notes has no way for other apps to read it, so an iPhone Shortcut sends the note
to her Google script whenever she closes Notes. Build it in the **Shortcuts** app:

1. New shortcut, named "Send meals to hub".
2. **Find Notes** where *Name* *is* `Meals` (use the note's real title), Limit 1.
3. **Get Details of Notes** → *Body*.
4. **Text** containing the *Body* variable (this turns it into plain text).
5. **Get Contents of URL**. URL: her `/exec` URL. Method: **POST**. Request body:
   **JSON** with three Text fields: `key` = her key, `action` = `meals`, `text` = the
   *Text* variable.
6. Then under **Automation → + → App**, pick *Notes*, choose *Is Closed*, set it to
   **Run Immediately**, and select this shortcut. You can add a second **Time of Day**
   automation (e.g. 6am) as a backup.

The hub finds today's section by day name. A day on its own line with the meals below it
works, and so does `Mon – Tacos` on one line. Labels like `Dinner: Tacos` get a colored
tag. If the note has no day names, the hub shows the whole thing.

### 3. Photos (optional)

Make a Google Drive folder (e.g. "Family Hub Photos") and drop pictures in. Google Photos
can't be used because it no longer lets outside apps read your library. Share the folder as
**Anyone with the link → Viewer**, so the tablet can show the images without being signed
in. Then copy the ID from the folder's address (`drive.google.com/drive/folders/THIS_PART`)
into `PHOTO_FOLDER_ID` and publish a new version. Only one of you needs to do this, and if
you both do, both folders show up. New photos appear within the hour.

### 4. The tablet

- Open `hub.html` in Chrome, then use ⚙️ → **Copy setup link** on a phone where you've
  already filled everything in, and open that link on the tablet so nobody has to type
  keys on it. The link contains the keys, so send it only to each other.
- Chrome menu → **Add to home screen / Install**. The installed hub opens full screen in
  landscape.
- Settings on the tablet: **Display → Screen timeout** to the longest option (the hub also
  asks Chrome to keep the screen on while it's open). Keep it plugged in.
- For a real kiosk, where the tablet boots straight into the hub, the screen turns off on a
  schedule, and nobody can wander into other apps, use **Fully Kiosk Browser** (Play Store,
  one-time license) and set the hub URL as its start page.

Night mode (10pm–6am by default), how long before the photo frame starts, seconds per
photo, and the weather ZIP are all in Settings.

The family list lives in the first person's script, so it's the same on every screen that
uses that script. Checked items clear after two days or with **Clear checked**.
