# Your export, file by file

*Settings → **Download everything*** gives you a zip: a folder of plain files
holding everything LoopUpward knows about you. It is built in your browser and
goes nowhere else.

This page documents every file and every column. The same reference ships
inside the zip as `README.md`, so the export explains itself even if you never
come back here.

> **LoopUpward contains no AI and never calls one.** What it does instead is
> record honestly — including the parts that did not go well — so that when
> *you* want to ask something of your own life, you have the material to ask
> with. The export is the deliverable; the rest of the app exists to make it
> worth reading.

## Two rules that shape every file

### 1. Which day a row belongs to

Every file has a `day` (or `planned_day`) column holding a local date,
`YYYY-MM-DD`. **It is not always the calendar day its timestamp falls on.**

- **The rollover hour** (Settings → Your clock, default `04:00`). The calendar
  flips at midnight; people don't. Anything before that hour can count for the
  previous day.
- **Routines whose window wraps past midnight.** A night routine set to
  21:00 → 02:00 belongs to *the evening it started*. Tick its last step at
  1:15am on the 9th and the row reads `day = 2026-08-08`.

Group by `day` for "how many days did I do this". Group by the timestamp for
"what time of day do I do this". Both are in every file on purpose.

### 2. How timestamps are written

Each moment appears three ways, so you never do timezone arithmetic:

| Column | Example | What it is |
| --- | --- | --- |
| `*_at` | `2026-08-18T06:12:44+05:30` | ISO-8601 with the UTC offset in force **at that moment** |
| `*_local_time` | `06:12` | the wall clock you saw |
| `*_weekday` | `Tuesday` | the weekday it fell on |

Durations are always **minutes**, one decimal, everywhere.

**Empty means "not recorded", never zero.** A blank `mood` is a day you did not
rate. Nothing in the bundle is backfilled with a guess.

### 3. Which zone a timestamp was rendered in

`focus_sessions.csv` and `events.ndjson` recorded the UTC offset in force at the
moment, so they are exact — travel and daylight saving included. Every other
file is rendered in **your own timezone** from Settings, which is right except
during a trip. `manifest.json` lists which files got which, under `timezone`.

### 4. What the record cannot know

The behavioural event log and the focus-session log started later than the rest
of the app. `manifest.json` gives the exact date under `observation_begins`, and
the bundle's own README repeats it.

Before that date:

- Zeros in `daily.csv` for `app_opens`, `events` and `focus_sessions` mean
  **not observed**, not "did nothing".
- What a habit's target was, what schedule it was on, and which steps a routine
  held cannot be reconstructed — so the files that need those say `unknown` in a
  `*_source` column and leave the verdict blank.

**A blank verdict is deliberate.** Raising a water habit from two glasses to
three must not turn every past two-glass day into a failure, and a routine step
added last week must not appear as six months of skipping. Where the export
cannot establish what was being asked for at the time, it says so instead of
using today's answer.

## The files

### Read first

| File | What it is |
| --- | --- |
| `README.md` | this reference, written for someone who has never seen the app |
| `manifest.json` | coverage windows, timezone grades, and the vocabulary of every coded column — what the record can and cannot know |
| `context.md` | your timezone, when your day rolls over, and what each area of your life is for |
| `summary.md` | the computed numbers, formatted to read |

### The three kinds of file

- **Record** — what happened, at the time it happened: `logs.csv`,
  `actions.csv`, `focus_sessions.csv`, `events.ndjson`, `habit_days.csv`,
  `routine_steps.csv`, `seeds.csv`, `list_entries.csv`, `day_order.csv`, and the
  journal / reflection / note files.
- **State as of export** — how things look *today*: `items.csv`, `areas.csv`,
  `labels.csv`, `context.md`. A goal reading "done" here says nothing about the
  journey; that is in the Record files.
- **Derived** — plain counting over the Record, and recomputable:
  `schedule_expectations.csv`, `daily.csv`, `summary.md`.

### `schedule_expectations.csv` — what was *supposed* to happen

Everything else records what you did, and **a missed day is not a row anywhere —
it is the absence of one**. This file supplies the other half: one row per
scheduled item per day it was alive, saying whether that day was `required`
(a fixed schedule named it), `not_due`, `eligible` (a quota schedule like
"4× a week", where the period is owed rather than the day), or `unknown`.

Adherence becomes a join rather than a reconstruction: filter
`expectation = required` and take the share with `met = true`. Retiring a habit
ends its expectations that day, so the months after you deliberately stopped are
not counted against you.

### `areas.csv`

`area_id` · `name` · `emoji` · `color` · `position` · `description` ·
`why_it_matters` · `target_share` (0–1) · `created_at` / `created_local_time` /
`created_weekday`.

### `items.csv`

Every node, including finished, archived and trashed ones.

| Column | Meaning |
| --- | --- |
| `item_id`, `title` | identity |
| `kind` | note, folder, quote, idea, dream, goal, habit, routine, list, project, book, milestone, principle, promise, lesson, memory |
| `tracker` | `none`, `check`, `counter`, `percent`, `money`, `habit`, `book` |
| `status` | `active`, `done`, `someday`, `archived` |
| `area_id`, `area_name` | resolved up the parent chain, exactly as the app reads it |
| `parent_id`, `parent_title` | what it nests inside |
| `horizon` | `someday`, `life`, `year`, `quarter`, `month`, `week`, `today`, `date` |
| `horizon_period` | which instance: `2026-W28`, `2026-08`, `2026-Q3`, `2026`, or the pinned day |
| `date_repeats_yearly` | a birthday rather than a one-off |
| `target`, `current`, `unit`, `progress_fraction` | the meter |
| `cadence`, `cadence_days`, `cadence_count` | the schedule. Weekday numbers are **0 = Sunday** |
| `window_start`, `window_end` | routines only. **End before start = wraps past midnight** |
| `pulled_today`, `pinned`, `labels`, `note` | the rest of its state |
| `step_count`, `planned_minutes`, `entry_count` | routine and list contents |
| `created_*`, `completed_*`, `deleted_*` | three timestamp groups |
| `age_days`, `days_to_complete` | computed for you |

### `actions.csv`

Every concrete thing planned for a day. `planned_day` is what it was *meant*
for; `done_at` is when it was actually ticked; `days_late` is the gap, and
**negative means early**.

Moves between days are not visible here — this file only has the final date.
Every move is an `action.rescheduled` event, and the totals are in
`summary.md`.

`amount` is how much finishing it moves the linked item's counter. `0` is a
deliberate choice: a directional step that belongs to a goal without pretending
to move its meter.

### `logs.csv`

Every unit of progress ever recorded. Item counters are derived from these, not
the other way round.

`op` is `add` (a delta — a habit day, +1 chapter) or `set` (a snapshot — money
now reads ₹40,000). **Sum `add` rows; take the last `set` row.** Mixing them
gives nonsense.

`source` says how the value got there:

| Value | Means |
| --- | --- |
| `today_check` | ticked on the Today list |
| `item_page` | changed on the item's own page |
| `focus_timer` | recorded inside a focus session |
| `routine_run` | written by a routine's script |
| `parent_cascade` | a child finished, so this parent's meter moved. `via` names the child |
| `manual` | typed in somewhere else |
| `import` | carried in from another device |
| `unknown` | written before provenance existed — not a bug, and not a claim it was manual |

### `focus_sessions.csv`

One row per timer attempt, **written when it ended for any reason**. Abandoned
attempts sit here on the same footing as completed ones; that is the point of
the file.

`kind` is `focus`, `routine_step`, `routine_run`, `day_run` or `rest`.
`outcome` is `completed`, `expired` (countdown ran out and the screen was
left), `abandoned` (closed mid-session), `skipped` or `interrupted` (swapped
for something else).

`planned_minutes` blank means it was untimed and counted up.
`actual_minutes` is wall clock **with pauses excluded**.
`over_under_ratio` is `actual ÷ planned` — above 1 means it took longer than
you thought.

A routine produces one `routine_run` row **plus** one `routine_step` row per
step. Do not add both, or you double-count the time.

### `habit_days.csv`

What a habit or routine meant on one specific day. "Clean" is the habit;
"clean the side desk" is what it meant on Tuesday. Carries `day_plan`,
whether the day was `logged`, `value_logged` against `daily_target` (2 of 3
glasses), and `steps_done` / `steps_total` for routines.

### `routine_steps.csv`

One row per routine, per day, per step. `position` is where the step sits in
the written script; `tick_order` is the order you *actually* did them, which is
often different. `done_at` is blank on days recorded before step timestamps
existed, even where `done` is true.

### `daily.csv`

One row per day, everything paired and nothing interpreted: journal presence,
mood, energy, sleep hours and quality, stress, focus rating, tasks planned and
completed, habit and routine days, focus minutes planned versus actual,
abandoned sessions, pauses, app opens, first open, last write, distinct routes,
and total events.

**The app deliberately does not compute correlations for you.** It emits honest
columns; the question is yours.

There is no usage table: the app-open columns are derived from `app.opened` and
`page.viewed` events, so there is one record of what happened rather than a
counter to reconcile.

### `list_entries.csv`, `seeds.csv`, `labels.csv`, `day_order.csv`

- **`list_entries.csv`** — lines inside list items. `picked_at` is when a line
  became "the one I'm on"; `days_being_tried` counts from there.
- **`seeds.csv`** — raw captures. `days_resting` is how long a thought sat
  before it grew into something.
- **`labels.csv`** — your tags, with `items_tagged` counted for you.
- **`day_order.csv`** — the manual order you dragged a day into, one row per
  position. `entry_kind` separates a real `action` from a scheduled `habit` row
  or a longer-horizon `item` pulled onto today.

### `events.ndjson`

The full behavioural log: one JSON object per line, oldest first. Read it with
`jq`, or `pandas.read_json(lines=True)`.

Every line carries `id`, `type`, `at`, `at_ms`, `local_time`, `weekday`, `day`,
`timezone`, `utc_offset_minutes`, `item_id`, `item_title` and a `payload`.

Notable types:

| `type` | What it records |
| --- | --- |
| `item.created` | the birth snapshot: kind, tracker, horizon, area, parent, target, cadence, labels |
| `item.horizon_changed` | **re-scoping** — how a goal drifts from "this quarter" to "someday" |
| `item.completed` | with `ageDays` and `openActionsRemaining` |
| `action.rescheduled` | **the procrastination signal** — `from`, `to`, `daysMoved` |
| `routine.step_skipped` | `sentToBack: true` = "skip for now"; `false` = an optional step left out |
| `day_run.abandoned` | with `completedBefore` — how far it got |
| `day.reordered` | `via: "drag"` or `via: "sort"` — different acts, recorded differently |
| `app.opened`, `page.viewed` | being here at all. Routes are recorded in shape (`/item/[id]`), never which note you had open |

Events are append-only. Nothing is edited or deleted, including the records of
things that did not work out.

### Human text

- **`journal.md`** — every daily entry in order, with ratings and your words.
- **`reflections.md`** — every period reflection, and whether its intentions
  were met. Scoring is plain counting against the named items: days logged for
  a habit, units added for a meter, done-or-not for a one-off. An intention
  naming nothing countable is shown as not scored.
- **`notes.md`** — note bodies, in the app's own markdown.

### `raw.json`

Every table exactly as stored, plus both streams and your settings. If a CSV
lost some nuance to being a table, it is here.

## Questions this bundle can answer

- What time of day do I really work, versus when I think I do?
- How much longer do things take than I plan for?
- What do I keep pushing, and by how many days in total?
- Which routine step do I quit on?
- Am I creating things faster than I finish them?
- Which weekday breaks my streaks?
- Does sleep track with what I get done?

## Signed in or not

The bundle is identical either way. Signed in, the rows come from your private
cloud; signed out, they come from this browser's own storage. The same
generator builds the same files, so keeping your data local never costs you a
lesser export.
