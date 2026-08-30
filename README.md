# Morning-routine-

Two single-file pages, no build step, no accounts, no app to install. Open either one,
add it to your phone's home screen, and it works offline.

| File | Who it's for | What it does |
| --- | --- | --- |
| `index.html` | Paul | The morning routine: timed steps, voice prompts, ball jar. |
| `tracker.html` | Mom and Dad | Behavior data: non-compliance, toileting accidents, tantrums. |

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

### Two phones, no accounts

Entries live in each phone's own browser storage. **Share my log** packs that phone's last
30 days into a link — a few hundred characters for a typical day — that you text to the
other phone. Opening it offers to merge; **Merge a shared log** does the same from a pasted
link. A phone only ever ships the entries it recorded itself, and merged entries keep stable
identities, so re-sharing updates the log instead of duplicating it and neither phone can
overwrite the other's records.
