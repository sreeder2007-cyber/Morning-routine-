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

### Adding events from the hub

Each day on the calendar has a **+ Add** button. Type what it is, pick the day, and add
times (or leave them empty for all day), a place, and whose calendar it goes on. It's saved
straight to that person's Google Calendar and appears on the hub right away. Tick **Invite
everyone else** to put it on the others' calendars too; that needs each person's Google
email filled in under ⚙️ Settings, and no invite email is sent.

The 3-day view (the default) also shows each day's forecast and that night's dinner from
the meals note. Switch to 5 or 7 days in Settings for more days at a glance.

If you set up the script before this feature existed, paste in the latest `hub-script.gs`
and publish a new version (**Deploy → Manage deployments → ✏️ → New version**).

### 1b. School dates from APS email and photos (automatic)

A scheduled Claude task runs twice a day, at 6:47am and 5:47pm Albuquerque time, on Scott's
Claude plan, so no API key or extra billing is needed. It uses the Gmail, Google Calendar
and Google Drive connections on that Claude account. Each run:

- reads new mail from `@aps.edu` (the district and teachers), including newsletters;
- reads new photos in the **Family Hub Inbox** folder in Scott's Google Drive;
- adds every date a parent needs (no-school days, early releases, picture day,
  conferences, field trips, form and payment deadlines) to Scott's calendar, with a 🏫 in
  front of school items, and invites Carolyn so it's on her calendar too. No invite email
  is sent.

It works out relative dates ("this Sunday") from when the email was sent or the photo was
taken. Before adding anything it checks the calendar, so reminder emails don't create
duplicates. Handled emails get the Gmail label **Family Hub/Added**, and handled photos move
to **Family Hub Inbox/Done**. Anything that fails is retried at the next run. The task
never replies to, deletes or forwards anything.

You can see, edit, pause or run it now from **Routines** in Claude (claude.ai/code).

**Adding a date from a photo:** tap **📷** on the hub, take a picture of the flyer, calendar
or schedule (or pick one from the tablet's gallery), and add an optional note like "Paul's
class only". It's saved to the inbox folder and shows up on the calendar after the next
run. From a phone, you can also drop a JPG, PNG or PDF straight into the **Family Hub Inbox**
folder in Google Drive. iPhone HEIC photos don't work there, so use the hub or a screenshot.
The 📷 button saves to the first person's script, so Scott should be first in Settings. The
script creates the folder when you run **setup**.
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
