# Morning-routine-

Two single-file pages, no build step, no accounts. Open either one, add it to your
phone's home screen, and it works offline.

| File | Who it's for | What it does |
| --- | --- | --- |
| `index.html` | Paul | The morning routine: timed steps, voice prompts, ball jar. |
| `tracker.html` | Mom and Dad | Behavior data: non-compliance, toileting accidents, tantrums. |

## tracker.html

Three counts, one tap each, plus the piece that's easy to get wrong by hand — the
10-second latency window for non-compliance.

- **Instruction given** starts a 10-second countdown. Tap **Paul started** and
  nothing is recorded. Let it run out and non-compliance is logged automatically,
  timestamped at the 10-second mark, with a buzz so you don't have to watch the screen.
- The **episode** stays open until you mark that he began the task or asked for help
  or a break, which records how long it lasted. A 30-second engagement clock then
  shows when a new occurrence may be counted.
- Every entry can be retimed, annotated, or deleted; entries can be added after the fact.
- **Copy weekly summary** and **Copy CSV** produce something you can paste straight
  into an email to the BCBA.

Latency (10s), engagement (30s), the child's name, and who's logging are all in Settings.

Data lives in the browser's local storage on each device. When the same page is opened
as a shared Claude Artifact, both phones read and write one live log: each device only
ever writes its own records, and edits are published separately and merged, so
simultaneous taps can't overwrite each other.
