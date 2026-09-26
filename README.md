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

**During work hours** (Monday–Friday, 8am–5pm by default; change it in Settings), the form
offers to make the event **private** and add each person's **work email** as an **optional** guest
(also in Settings), so it blocks the time on work calendars without coworkers seeing what
it is. Only the work addresses get an invite email. Family members' Google calendars
still get it quietly. Private events show a 🔒 on the hub. Evenings, weekends and all-day
events are left alone.

The 3-day view (the default) also shows each day's forecast and that night's dinner from
the meals note. Switch to 5 or 7 days in Settings for more days at a glance.

If you set up the script before this feature existed, paste in the latest `hub-script.gs`,
run **setup** once to allow the new permission (it adds events through the Calendar API), and
publish a new version (**Deploy → Manage deployments → ✏️ → New version**).

### 1b. School dates from APS email and photos (automatic)

A scheduled Claude task runs twice a day, at 6:47am and 5:47pm local time, on the account
Claude plan, so no API key or extra billing is needed. It uses the Gmail, Google Calendar
and Google Drive connections on that Claude account. Each run:

- reads new mail from `@aps.edu` (the district and teachers), including newsletters;
- reads new photos in the **Family Hub Inbox** folder in that person's Google Drive;
- adds every date a parent needs (no-school days, early releases, picture day,
  conferences, field trips, form and payment deadlines) to their calendar, with a 🏫 in
  front of school items, and invites the other parent so it's on their calendar too. No invite email
  is sent.
- makes anything during work hours (a timed event Monday–Friday that overlaps 8am–5pm)
  private and adds both work emails as optional guests, the same way the hub's **+ Add** does.

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
The 📷 button saves to the first person's script, so the person whose account runs the scheduled task should be first in Settings. The
script creates the folder when you run **setup**.
### Security

- **Settings PIN.** Settings hold each script's key, so set a PIN under ⚙️ → *Lock settings*.
  After five wrong tries the PIN pad locks for a minute, then longer. A forgotten PIN can be
  cleared only by clearing the hub's site data in Chrome, which removes all settings.
- **Keys.** Each script answers only requests that carry its key (64 random characters for a
  new one). If the tablet is lost or a setup link goes somewhere it shouldn't, open the script
  and run **newKey**. The old key stops working at once. Then put the new key into Settings.
- **Setup links** contain the keys. Send them only to each other, then delete the message.
- **Locked-down page.** The hub may only talk to Google Apps Script, Google Drive images and
  the weather service. It loads no outside scripts, and every setting that arrives in a setup
  link is checked (only real script addresses, known colors, sensible numbers) before use.
- **The scheduled task** treats email and photo text as data, only ever creates calendar
  events, and never sends, forwards or deletes anything.
- **The tablet** doesn't need to be signed into your Google accounts, and it's safer if it
  isn't. Keep Android updated, and use a screen lock or Fully Kiosk's PIN if the tablet is
  somewhere visitors can reach.
- **This repository is public.** No keys or passwords are stored in it, but anyone can read
  it. See the note at the end of this section.

**Note on the public repository:** the other pages and parts of this README mention the family
and the behavior log by name. Either remove the names, or make the repository private.
GitHub Pages for a private repository needs a paid GitHub plan.

### Dinner planning

Tap **Plan dinners** on the dinner card. The planner shows a week of dinners, **Friday to
Thursday** by default (change it in Settings → *Dinner weeks start on*), with **Next week** and
**Week after**. Type a dinner, or start typing and pick a favorite. Each box saves as soon as you
leave it and shows on every screen: tonight's dinner and the rest of the week on the card, and
each day's dinner in the calendar columns. Phones can plan too: open the hub link and add it to
the home screen.

**Favorites** hold a dinner's recipe link, who can cook it, and its shopping list. Tap one to
edit it, or use the ＋ chips (this week's dinners that aren't favorites yet) or **＋ New
favorite**. When a planned dinner matches a favorite, 🔗 opens the recipe and 👨‍🍳 shows who can
cook it. Matching ignores capitals, emoji and a one-letter typo, so "Ghoulash 👻" finds "Goulash".
🛒 on a day, or **Add the week's groceries**, puts favorites' ingredients on the family list,
skipping anything already there.

**Moving over from the Notes app:** in the planner, tap **Import from the Notes app** and paste
the whole meals note. Dated weeks (a line like `9/25`, then `Friday- Chicken pot pie soup`) fill
the planner. A recipe name followed by its link (on the same line or the next) becomes a
favorite with that link, and names under a line like `Meals Scott can cook` are tagged with that
cook. Links with no name nearby are counted and skipped, since there's no telling what dish
they are. It shows what it found before saving anything. Importing twice is safe: favorites merge
and existing ingredients are kept.

The plan and favorites live in the first person's script, like the family list, with two weeks
of history. To use them, update the script to the latest `hub-script.gs` and publish a new
version. Until the note is imported, the hub still reads it for any day the planner leaves empty.

### 2. The meals note (optional, older way) (your wife's iPhone, ~3 minutes)

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

**iCloud Shared Album (easiest for iPhones).** Anyone in the album adds pictures from their
phone as usual, and they show on the hub's photo frame within the hour.

1. On an iPhone, in **Photos**, open the shared album (or create one under **Albums → + → New
   Shared Album**).
2. Tap the **People** icon, turn on **Public Website**, and tap **Share Link** → **Copy**.
3. On the hub: **⚙️ → your name → Photo album**, paste the link, and tap **Use album**. It
   reads the album right away and tells you how many photos it found, or what's wrong. The link
   is saved in your Google script, not on the tablet, and nobody has to edit the script.

Videos are skipped. With Public Website on, anyone who has the album link can see the photos,
the same as a Drive folder shared by link. The link is only in your script, never in this
repository. The hub reads the album the way Apple's album web page does. Apple doesn't
document that, so if Apple ever changes it, the Drive option below still works.

**Google Drive folder.** Put pictures in a Drive folder, share it as **Anyone with the link →
Viewer**, and paste its link into **Photo album** in Settings the same way (the folder's link works as-is). Google Photos can't be
used, because it no longer lets outside apps read your library.

Each script holds one album or folder at a time. Leave the box blank and tap **Use album** to
turn photos off. `ICLOUD_ALBUM` and `PHOTO_FOLDER_ID` at the top of the script still work if
you'd rather type the link there, but Settings takes priority.

If both of you set an album in your own scripts, the frame mixes them.

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
