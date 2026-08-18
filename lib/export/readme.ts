/**
 * README.md, the file that makes the rest of the bundle usable.
 *
 * Written for someone with zero knowledge of this app — including the person
 * who made the export, a year from now, who will have forgotten everything.
 * Every file gets a column-by-column legend, every rule that shapes the data
 * is stated (day attribution above all), and every place the data lies by
 * omission is admitted rather than glossed over.
 */

import { isoWithOffset } from "../clock";
import { LifeStats } from "../stats";
import type { BundleInput } from "./bundle";

export function buildReadme(input: BundleInput, stats: LifeStats): string {
  const { db, streams, settings, account, generatedAt } = input;
  const rollover = stats.dayRolloverHour;
  const tz = settings.timezone || "(not recorded)";
  const counts = {
    areas: db.areas.length,
    items: db.items.length,
    actions: db.actions.length,
    logs: db.logs.length,
    journal: db.journal.length,
    reflections: db.reflections.length,
    labels: db.labels.length,
    seeds: db.seeds.length,
    habitDayNotes: db.habitDayNotes.length,
    dayOrder: db.dayOrder.length,
    focusSessions: streams.focusSessions.length,
    events: streams.events.length,
  };

  return `# Your LoopUpward export

Made ${isoWithOffset(generatedAt)} from ${
    account.mode === "cloud" ? `the account ${account.email ?? ""}`.trim() : "this device's own storage"
  }.
${stats.range ? `Covering ${stats.range.start} to ${stats.range.end} — ${stats.daysCovered} days.` : "No activity recorded yet."}

This is everything the app knows about you, in files you can read yourself or
hand to any tool you like. **The app never sends any of this anywhere.** It was
assembled in your browser, and it goes wherever you take it and nowhere else.

There is no summary written by a machine in here, and no interpretation. Every
number in \`summary.md\` is counting you could redo by hand from the CSVs; this
file tells you exactly how each one was counted, so you can check it.

---

## What LoopUpward is, in one paragraph

Everything you capture starts as a **seed** — a raw thought. A seed can become
an **item**, which is the universal node: a note, a goal, a habit, a routine, a
book, a money target, a project. Items nest inside each other without limit,
and progress flows upward, so finishing a chapter moves the book, which moves
"read 6 books this year". Items with a schedule show up on your **Today** list.
Concrete one-off things to do are **actions**. Everything that counts as
progress — a habit day, a counter bump, a money update — is written as a **log**
entry, never as a bare number, so history is always reconstructable. Periods of
time get **reflections**; days get **journal** entries.

---

## The one rule you must know: which day a row belongs to

Every file has a \`day\` (or \`planned_day\`) column holding a local calendar
date, \`YYYY-MM-DD\`. **It is not always the calendar day the timestamp falls
on.** Two rules move it:

1. **The rollover hour, currently ${rollover}:00.** The calendar flips at
   midnight; people don't. Anything recorded before ${rollover}:00 local can
   belong to the previous day.
2. **Routines with a window that wraps past midnight.** A night routine set to
   run 21:00 → 02:00 belongs to *the evening it started*. Tick its last step at
   1:15am on the 9th and the row says \`day = 2026-08-08\`, because that is the
   night you were living. The app calls this \`routineLogDay()\`.

So: **a routine row's \`day\` is deliberately not its calendar day**, and if you
group by \`day\` you get the answer the person would give; if you group by the
timestamp you get the answer a clock would give. Both are in every file, on
purpose. Use \`day\` for "how many days did I do this", and the timestamps for
"what time of day do I do this".

## How timestamps are written

Every moment appears three ways, so no timezone arithmetic is ever needed:

| Column | Example | What it is |
| --- | --- | --- |
| \`*_at\` | \`2026-08-18T06:12:44+05:30\` | ISO-8601 **with the UTC offset that was in force at that moment** |
| \`*_local_time\` | \`06:12\` | the wall clock you actually saw |
| \`*_weekday\` | \`Tuesday\` | the weekday it fell on |

The offset is recorded per row rather than per file, so a year that spans
travel and daylight-saving changes stays readable. Your zone at export time was
**${tz}**.

Durations are always **minutes**, with one decimal. Never seconds in one column
and minutes in another.

Empty means "nothing recorded", which is not the same as zero. A blank \`mood\`
is a day you did not rate; a \`0\` is a day you rated as zero. Nowhere in this
bundle is a blank filled in with a guess.

---

## The files

### Read these first

**\`README.md\`** — this file.

**\`context.md\`** — who you said you are, what you said you were becoming, your
targets, and what each area of your life is for. All of it optional and all of
it typed by you. This is what makes the rest interpretable: an area with the
lowest completion rate means something different once the area says what it is
for.

**\`summary.md\`** — the computed statistics, formatted to read. Nothing in it
is inferred; the legend below says what each figure counted.

### The raw streams (CSV)

Every CSV is **fully denormalized** — an item's title and its area's name are
on the row itself, never behind a join — so any one file can be opened alone and
understood. All of them use RFC 4180 quoting and carry a header row.

---

#### \`areas.csv\` — ${counts.areas} rows

The parts of life you divided things into.

| Column | Meaning |
| --- | --- |
| \`area_id\` | stable id, referenced by \`items.csv\` |
| \`name\`, \`emoji\`, \`color\` | as shown in the app |
| \`position\` | your manual ordering |
| \`description\`, \`why_it_matters\` | your own words, optional |
| \`target_share\` | 0–1: how much of your attention this area was meant to get, optional |
| \`created_at\` / \`created_local_time\` / \`created_weekday\` | when the area was made |

---

#### \`items.csv\` — ${counts.items} rows

Every node, including finished, archived and trashed ones.

| Column | Meaning |
| --- | --- |
| \`item_id\` | stable id, referenced everywhere else |
| \`title\` | its name |
| \`kind\` | note, folder, quote, idea, dream, goal, habit, routine, list, project, book, milestone, principle, promise, lesson, memory |
| \`tracker\` | how progress is measured: \`none\`, \`check\` (done/not), \`counter\` (132 of 200), \`percent\`, \`money\`, \`habit\` (per-day), \`book\` (chapters) |
| \`status\` | \`active\`, \`done\`, \`someday\`, \`archived\` |
| \`area_id\`, \`area_name\` | resolved by walking up the parent chain, exactly as the app does — so a nested item shows the area it actually lives in |
| \`parent_id\`, \`parent_title\` | what it is nested inside |
| \`horizon\` | the planning bucket: \`someday\`, \`life\`, \`year\`, \`quarter\`, \`month\`, \`week\`, \`today\`, or \`date\` (pinned to one calendar day) |
| \`horizon_period\` | which specific instance of that bucket: \`2026-W28\`, \`2026-08\`, \`2026-Q3\`, \`2026\` — or the pinned day when \`horizon = date\` |
| \`date_repeats_yearly\` | a birthday rather than a one-off appointment |
| \`target\`, \`current\`, \`unit\` | the tracker's numbers |
| \`progress_fraction\` | \`current / target\`, blank when there is no target |
| \`cadence\` | \`daily\`, \`weekdays\`, \`days\` (see \`cadence_days\`), \`weekly\` (see \`cadence_count\`), \`monthly\` |
| \`cadence_days\` | space-separated weekday numbers, **0 = Sunday** |
| \`cadence_count\` | for \`weekly\`: how many times per week |
| \`window_start\`, \`window_end\` | routines only: the hours it shows on Today, local \`HH:MM\`. **End earlier than start means it wraps past midnight** — that is the routine day rule above |
| \`pulled_today\` | temporarily surfaced onto Today from a longer-horizon list |
| \`pinned\` | pinned in the app |
| \`labels\` | label names, \`\|\`-separated |
| \`note\` | your plain-text annotation |
| \`step_count\`, \`planned_minutes\` | routines: how many steps and what they claim to add up to |
| \`entry_count\` | lists: how many lines |
| \`created_*\`, \`completed_*\`, \`deleted_*\` | the three timestamp groups. \`deleted_at\` set means it is in the trash |
| \`age_days\` | days from creation to the export date |
| \`days_to_complete\` | creation to completion, blank if unfinished |

---

#### \`actions.csv\` — ${counts.actions} rows

One row per concrete thing planned for a day.

| Column | Meaning |
| --- | --- |
| \`action_id\` | stable id |
| \`title\` | what it was |
| \`planned_day\`, \`planned_weekday\` | the day it was *meant* for |
| \`done\` | true/false |
| \`done_at\`, \`done_local_time\`, \`done_weekday\` | when it was actually ticked |
| \`days_late\` | \`done day − planned day\`. **Negative means finished early**; blank means not done |
| \`item_id\`, \`item_title\`, \`item_kind\`, \`area_name\` | what it belongs to, if anything |
| \`amount\` | how much completing it moves the item's counter. \`0\` is a deliberate choice: a directional step that belongs to a goal without pretending to move its meter |
| \`priority\` | 0 normal, 1 high |
| \`note\` | free text |
| \`created_*\` | when the task was written down |

Tasks that were *moved* between days do not show that here — this file has only
the final date. Every move is in \`events.ndjson\` as \`action.rescheduled\`, and
the totals are in \`summary.md\`.

---

#### \`logs.csv\` — ${counts.logs} rows

Every unit of progress ever recorded. This is the app's real history: item
counters are derived from these, not the other way round.

| Column | Meaning |
| --- | --- |
| \`log_id\` | stable id |
| \`day\`, \`weekday\` | the day it counts for (see the day rule above) |
| \`item_id\`, \`item_title\`, \`item_kind\`, \`area_name\` | what moved |
| \`op\` | \`add\` = a delta (a habit day, +1 chapter). \`set\` = a snapshot (money now reads ₹40,000, a course now reads 45%) |
| \`value\` | the delta, or the snapshot value |
| \`source\` | **how it got there** — see the table below |
| \`via\` | the specific control, free text |
| \`logged_at\` / \`logged_local_time\` / \`logged_weekday\` | the real moment it was recorded — the timestamp for time-of-day questions |

\`source\` values:

| Value | Means |
| --- | --- |
| \`today_check\` | ticked on the Today list |
| \`item_page\` | changed on the item's own page |
| \`focus_timer\` | recorded from inside a focus session |
| \`routine_run\` | written by a routine's script — for example, ticking the last required step logs the routine's day |
| \`parent_cascade\` | not done directly: a child finished, so this parent's meter moved. \`via\` names the child |
| \`manual\` | typed in somewhere else |
| \`import\` | carried in from another device |
| \`unknown\` | **written before provenance was recorded.** Not a bug, and not a claim that it was manual |

Sum \`add\` rows for cumulative things (habits, counters, books). Take the last
\`set\` row for point-in-time things (money, percent). Mixing the two gives
nonsense.

---

#### \`focus_sessions.csv\` — ${counts.focusSessions} rows

One row per timer attempt, **written when it ended for any reason**. Abandoned
attempts are here on exactly the same footing as completed ones; that is the
point of the file.

| Column | Meaning |
| --- | --- |
| \`session_id\` | stable id |
| \`day\`, \`weekday\` | the day it counts for |
| \`kind\` | \`focus\` (one task), \`routine_step\` (one step of a script), \`routine_run\` (a whole routine), \`day_run\` (a walk through chosen tasks), \`rest\` (the breather between two of them) |
| \`outcome\` | \`completed\` ticked done · \`expired\` countdown ran out and the screen was left · \`abandoned\` closed mid-session · \`skipped\` deliberately passed over · \`interrupted\` swapped for something else |
| \`item_id\`, \`item_title\`, \`area_name\` | what was being worked on |
| \`step_id\`, \`step_title\` | which step, for routine steps |
| \`entry_id\` | the Today row it started from. Real task ids look like uuids; rows generated from a schedule look like \`habit:<itemId>:<date>\` |
| \`started_*\`, \`ended_*\` | the two ends of the attempt |
| \`planned_minutes\` | what was asked for. **Blank means untimed** — it counted up instead |
| \`actual_minutes\` | wall clock, **pauses excluded** |
| \`paused_minutes\`, \`pause_count\` | how long it sat paused, and how often |
| \`over_under_ratio\` | \`actual ÷ planned\`. Above 1 = took longer than expected. Blank when nothing was planned |
| \`timezone\`, \`utc_offset_minutes\` | where you were |

Every duration here is wall-clock: measured from timestamps, never by counting
timer ticks. Browsers throttle background tabs to about one tick a minute, so a
tick-counting timer would systematically under-report exactly the sessions
where you walked away.

A whole routine produces one \`routine_run\` row **plus** one \`routine_step\` row
per step. **Do not add both together** — the run holds the steps, so its minutes
are their minutes again. To total time spent, sum only the leaf rows
(\`kind\` of \`focus\` or \`routine_step\`); to see how long whole routines take,
look at \`routine_run\` rows on their own. \`summary.md\` and \`daily.csv\` already
do exactly that.

---

#### \`routine_steps.csv\`

One row per routine, per day, per step. This is where "what order did I
actually do it in" lives.

| Column | Meaning |
| --- | --- |
| \`routine_id\`, \`routine_title\`, \`area_name\` | which routine |
| \`day\`, \`weekday\` | the day it counts for — **remember the wrapped-window rule** |
| \`step_id\`, \`step_title\`, \`position\` | the step, and its place in the written script (0-based) |
| \`optional\` | the routine finishes without it; leaving it out does not fail the day |
| \`planned_minutes\` | what the script claims it takes |
| \`done\` | whether it was ticked that day |
| \`done_at\`, \`done_local_time\`, \`done_weekday\` | when. **Blank on days recorded before step timestamps existed**, even where \`done\` is true |
| \`tick_order\` | 1-based order the steps were actually ticked that day, which is often not \`position\` |
| \`linked_item_id\`, \`linked_item_title\` | the step stands for a real item elsewhere (ticking one ticks both) |
| \`day_plan_note\` | what you wrote that this day's occurrence meant ("clean" → "clean desk") |

---

#### \`daily.csv\` — one row per day

Clean, paired series, built for correlating. **The app deliberately does not
compute correlations for you** — it emits honest columns and leaves the
question to you and whatever tool you use.

| Column | Meaning |
| --- | --- |
| \`day\`, \`weekday\` | the day |
| \`journal_written\` | you wrote something that day |
| \`mood\`, \`energy\`, \`sleep_quality\`, \`stress\`, \`focus_rating\` | 1–5, blank when not rated |
| \`sleep_hours\` | hours, blank when not recorded |
| \`has_gratitude\`, \`has_intention\` | whether those fields were filled |
| \`actions_planned\`, \`actions_completed\` | tasks for that day |
| \`habit_days_logged\`, \`routine_days_logged\` | how many distinct habits / routines counted as done |
| \`focus_sessions\` | attempts that day (rest breaks excluded) |
| \`focus_minutes_planned\`, \`focus_minutes_actual\` | the two halves of the ratio |
| \`focus_sessions_abandoned\` | how many were closed mid-way |
| \`pause_count\` | pauses across the day |
| \`app_opens\` | **once per device per day at most** — a tab reload is not an open |
| \`first_open_local\` | when the app was first opened |
| \`last_write_local\` | the last thing that changed anything (views excluded) |
| \`distinct_routes\` | how many different parts of the app were visited |
| \`events\` | total events recorded that day |

There is no separate usage table: these five columns are derived from
\`app.opened\` and \`page.viewed\` in \`events.ndjson\`, so there is one record of
what happened rather than a counter to reconcile.

---

#### \`list_entries.csv\`, \`seeds.csv\`, \`labels.csv\`, \`day_order.csv\`

**\`list_entries.csv\`** — lines inside list-kind items. \`picked_at\` is when a
line became "the one I'm on" (a list of things to try holds three states:
waiting, trying, done), and \`days_being_tried\` counts from there.

**\`seeds.csv\`** — raw captures. \`status\` is \`inbox\` → \`later\` → \`archived\`;
\`became_item_id\` is filled when a seed grew into something, and \`days_resting\`
is how long it sat before that happened.

**\`labels.csv\`** — your tags, with \`items_tagged\` counted for you.

**\`day_order.csv\`** — the manual order you dragged a day's list into, one row
per position. \`entry_kind\` distinguishes a real \`action\` from a row generated
by an item's schedule (\`habit\`) or by a longer-horizon item pulled onto today
(\`item\`).

---

#### \`events.ndjson\` — ${counts.events} lines

The full behavioural log: **one JSON object per line**, oldest first. Read it
with \`jq\`, pandas (\`read_json(lines=True)\`), or one line at a time.

Every line has \`id\`, \`type\`, \`at\` (ISO with offset), \`at_ms\`, \`local_time\`,
\`weekday\`, \`day\`, \`timezone\`, \`utc_offset_minutes\`, \`item_id\`, \`item_title\`,
and a \`payload\` whose shape depends on \`type\`.

| \`type\` | What it records |
| --- | --- |
| \`item.created\` | a node entered your life. Payload carries its birth snapshot: kind, tracker, horizon, area, parent, target, cadence, labels |
| \`item.renamed\`, \`item.kind_changed\`, \`item.tracker_changed\` | \`from\` → \`to\` |
| \`item.horizon_changed\` | **re-scoping.** \`from\`/\`to\` and \`fromPeriod\`/\`toPeriod\`. This is how you see a goal drift from "this quarter" to "someday" |
| \`item.target_changed\`, \`item.cadence_changed\`, \`item.window_changed\` | the commitment itself moved |
| \`item.moved\` | area and/or parent changed |
| \`item.labels_changed\`, \`item.pinned\`, \`item.unpinned\` | tagging and pinning |
| \`item.completed\` | payload has \`ageDays\` since creation and \`openActionsRemaining\` — what was still unfinished when the whole thing was called done |
| \`item.reopened\` | including \`doneForMs\`: how long it stayed done |
| \`item.trashed\`, \`item.restored\`, \`item.purged\` | the end of a node's life. \`by: "retention"\` means it aged out of the trash rather than being deleted by hand |
| \`action.created\` | payload has the date, amount, priority and \`origin\` |
| \`action.rescheduled\` | **the procrastination signal.** \`from\` → \`to\` and \`daysMoved\`. Every path that changes a task's date emits this, including drag and the plan sheet |
| \`action.amount_changed\`, \`action.priority_changed\`, \`action.note_edited\` | edits |
| \`action.done\`, \`action.undone\` | includes \`daysLate\` and \`carriedFrom\` |
| \`routine.step_done\`, \`routine.step_undone\` | with the step's index, how many are done, and whether it completed the day |
| \`routine.step_skipped\` | \`sentToBack: true\` = "skip for now"; \`false\` = an optional step left out for good |
| \`routine.reordered\` | a step pulled forward mid-run |
| \`day_run.started\` | the chosen plan: which rows, how many |
| \`day_run.finished\`, \`day_run.abandoned\` | with \`completedBefore\` — how far it got before it stopped |
| \`list.entry_added\`, \`list.entry_picked\`, \`list.entry_done\` | list lines, including \`triedForMs\` |
| \`seed.captured\`, \`seed.planted\`, \`seed.status_changed\`, \`seed.deleted\` | the capture inbox, including how long a thought rested before it grew |
| \`day.reordered\` | \`via: "drag"\` (deliberate) or \`via: "sort"\` (the tidy-up button) — different acts, recorded differently |
| \`journal.saved\`, \`reflection.saved\` | which fields were written, and how much |
| \`app.opened\` | once per device per local day |
| \`page.viewed\` | route changes. Ids are replaced with \`[id]\`, so the route shape is recorded and not which note you had open |

Events are append-only. Nothing here is ever edited or deleted, including the
records of things that did not work out.

---

### Human text

**\`journal.md\`** — every daily entry in date order, with its ratings, its one
intention for the day, and whatever you wrote.

**\`reflections.md\`** — every period reflection, with its ratings, wins,
lessons, blockers, per-area notes and the intentions it set. Each intention is
then **scored by counting**: for a habit or routine it counts days logged in the
following period; for anything with a meter it sums units added; for a one-off
it is done or not. An intention that named no item is shown as not scored,
because there is nothing to count and a guess would be worth less than an
honest blank.

**\`notes.md\`** — the bodies of note-kind items, in the app's own markdown,
unchanged.

### Machine-complete

**\`raw.json\`** — every table exactly as stored, plus both streams and your
settings. Nothing is flattened, renamed or dropped. If a CSV above lost some
nuance to being a table, it is here.

---

## What this export does not contain

- **Nothing has been sent anywhere.** These files were built in your browser.
- Rows written before a field existed are blank, not backfilled: \`source\` on
  old logs reads \`unknown\`, and \`done_at\` on old routine steps is empty.
- \`page.viewed\` records the shape of a route, never which specific note or item
  was open.
- Deleted seeds, labels and areas are gone; their ids may appear on older rows,
  where the name column reads \`(deleted …)\`.

## If you want to hand this to a tool

Everything here is plain text. A reasonable first move is to give it
\`README.md\`, \`context.md\`, \`summary.md\` and \`daily.csv\` together — that is the
smallest set that is genuinely interpretable — and add \`events.ndjson\` or the
other CSVs when you want to go deeper on a specific question.

Questions this bundle can actually answer, which most exports cannot:

- What time of day do I really work, versus when I think I do? (\`focus_sessions.csv\`)
- How much longer do things take than I plan for? (\`over_under_ratio\`)
- What do I keep pushing, and by how many days in total? (\`action.rescheduled\`)
- Which routine step do I quit on? (\`routine_steps.csv\`, \`run ended here\` in \`summary.md\`)
- Am I creating things faster than I finish them? (\`summary.md\`, arrivals per week)
- Which weekday breaks my streaks? (\`summary.md\`, streaks)
- Does sleep track with what I get done? (\`daily.csv\` — the columns are paired
  and unprocessed; the correlation is yours to draw)

## Row counts in this export

| File | Rows |
| --- | --- |
| areas.csv | ${counts.areas} |
| items.csv | ${counts.items} |
| actions.csv | ${counts.actions} |
| logs.csv | ${counts.logs} |
| focus_sessions.csv | ${counts.focusSessions} |
| events.ndjson | ${counts.events} |
| journal.md (entries) | ${counts.journal} |
| reflections.md (entries) | ${counts.reflections} |
| seeds.csv | ${counts.seeds} |
| labels.csv | ${counts.labels} |
| routine_steps.csv (day rows) | ${counts.habitDayNotes} |
| day_order.csv (days) | ${counts.dayOrder} |
| daily.csv | ${stats.daysCovered} |
`;
}
