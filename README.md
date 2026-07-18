# LoopUpward

Turn intentions into progress.

LoopUpward is a personal growth operating system that connects your thoughts, goals, habits, routines and reflections into one continuous improvement loop. It is mobile first, works on the phone and the desktop, and is explicitly not another todo app.

Most productivity tools start with tasks. Humans don't. We start with:

- "I want to learn a language."
- "I want to become healthier."
- "I should read this book."
- "I don't want another year to disappear."

LoopUpward captures those thoughts, helps turn them into systems, connects them to daily action, and shows whether life is actually moving forward.

## The loop

```
Capture -> Organize -> Act -> Reflect -> Improve -> (repeat)
```

## Features

### Capture, without friction

A blank space for thoughts, goals, ideas, quotes, dreams and plans. No forced folders, no setup. Capture first, structure later. A long thought typed in one line is never lost: it folds itself into a note body and keeps a short heading.

### Life: your own system

Create your own areas (Health, Career, Money, Learning, Relationships, anything), then fill them with items. Everything you make is the same universal object wearing different clothes: goal, habit, routine, list, project, book, milestone, note, or a keepsake like a quote or principle. You can change an item's kind, area, parent and time horizon at any time. Nothing is locked.

Any item can live inside any other:

```
Learn French
 └── Reach B2
      └── Finish grammar book
           └── Chapter 5 today
```

Two things happen automatically:

- **Progress flows upward.** An item with its own tracker reports it; one without averages its children. Tick the book forward and the course and the year goal above it both move.
- **Completion climbs.** Finishing an item nested inside a metered parent ticks that parent's meter by one, cascading all the way up, each move written into history like hand entered progress.

### Plan and Today: the execution layer

A short list of concrete actions with a progress bar and the day's journal beside it. Things land on today four ways: you add one directly, a repeat schedule puts it there, you break a piece off a goal, or you mark a goal for today.

- **Break off a piece** from any goal for today, tomorrow, next week or any day you pick. For metered goals you say how much the piece is worth, and zero is a real choice for directional steps ("clone the repo" adds no PRs but still moves you and stays under the goal).
- **Counts toward a goal** links a one off task to the goal it serves, and Today shows the provenance ("goal name") on the row.
- **Schedules** (daily, weekdays, chosen days, N times a week, monthly) put repeats on their days automatically.
- **A focus timer** on any row opens a full screen countdown for that one task, and keeps real wall clock time even when the tab is backgrounded.
- Week, month, quarter and year tabs hold standing lists you pull from when ready.

### Routines: the day on rails

A routine is a reusable timetable: ordered steps entered once, each optionally timed ("face wash 5 min, meditation 15, brush 5"). It stays a single entry on Today, so the steps never clutter the list. It keeps its own visible hours (a night routine can wait until 9pm and only appears then), and its step timer walks the script one step at a time, auto advancing through timed steps, asking once for untimed ones, and rotating "skip for now" to the back. It is checked off per day like a habit, with streaks.

Routines that wrap past midnight are attributed to the evening they started: a night routine finished at 12:30am counts for the night before, up to 4am. A "Borrow a target" shelf offers ready made routines and goals to start from.

### Lists: checkable contents under one name

Groceries, a push day, people to thank. Entries can carry amounts ("2 kg", "500") that add up per unit on the list's total line, they stay ticked once done (with an untick all reset for reusable lists), and the ticked share is the list's progress. The whole list is one node, so entries never clutter Life or Today. The lists index is a compact grid that expands one card at a time.

### Notes: longer thoughts

Plain markdown notes, kept loose or filed into folders (drag on desktop, long press drag on touch). The editor is a single window with a Write and Preview toggle, GitHub style. A note opens rendered, and shows its markdown syntax only when you choose to edit. Note cards show the full heading and a compact rendered preview.

### Reflect: see your progress

A daily journal lives on the Today screen (a morning "thinking about" box, an end of day reflection, mood and energy), because closing the day is part of the day. Weekly, monthly and quarterly reviews and habit history are built from what you actually wrote and did.

### Your data is yours

Full JSON export. Delete moves an item to Trash, recoverable for 7 days (30 with Premium). Children of a deleted item move up a level instead of being lost.

## Tech stack

**Frontend:** Next.js, TypeScript, Tailwind CSS, deployed to Cloudflare via OpenNext.

**Backend:** Rust, Axum, Tokio, SQLx, PostgreSQL, deployed on Railway.

**Auth:** Google Sign-In with a custom Rust session system and hashed session tokens; private per user data isolation.

**Billing:** Razorpay subscriptions with localized pricing (INR at home, USD abroad, chosen by geo with no manual currency switch), premium access, admin grants, and a signature verified payment webhook as the source of truth for the subscription lifecycle.

## Architecture

```
Frontend  ->  Rust API  ->  PostgreSQL
```

LoopUpward uses an event based model. Actions create immutable history events; streaks, progress, reports and reflections are computed from real history rather than mutable counters. The client keeps a local copy and syncs to the cloud, so the app stays responsive and your data survives.

## Documentation

Full user documentation lives in the mdBook under [`docs/`](./docs/src/SUMMARY.md):

- [The idea behind LoopUpward](./docs/src/idea.md)
- [Getting started](./docs/src/getting-started.md)
- [Capture](./docs/src/capture.md)
- [Notes](./docs/src/notes.md)
- [Life](./docs/src/life.md)
- [Plan](./docs/src/plan.md)
- [Routines](./docs/src/routines.md)
- [A worked example, top to bottom](./docs/src/example-cascade.md)
- [The completion rule](./docs/src/completion.md)
- [Reflect](./docs/src/reflect.md)
- [Settings, sync and your data](./docs/src/settings.md)
- [FAQ and gotchas](./docs/src/faq.md)

Build the book locally with `mdbook serve docs` and open the printed address.

## Philosophy

Notes remember who you wanted to become. Tasks remember what you had to do. LoopUpward remembers the journey between them.
