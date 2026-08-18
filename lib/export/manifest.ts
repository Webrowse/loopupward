/**
 * manifest.json — what this bundle is, and where its knowledge stops.
 *
 * The bundle used to print one "Covering <start> to <end>" line spanning every
 * table at once. But the two capture streams began long after the tables did,
 * so `daily.csv` carried real days with `app_opens = 0`, `events = 0`,
 * `focus_sessions = 0` — and a reader has no way to tell an inactive month from
 * a month before the app was watching. Read literally, the old bundle claimed
 * months of dormancy that never happened.
 *
 * So: coverage per table, the timezone grade per file, and the vocabularies, in
 * one machine-readable place. Nothing here is a statistic. It is the bundle
 * describing its own limits, which is the only way an outside reader can tell
 * absence of evidence from evidence of absence.
 */

import { LifeStats } from "../stats";
import { EVENT_TYPES } from "../types";
import type { BundleInput, Ctx } from "./bundle";

interface Coverage {
  rows: number;
  first: string | null;
  last: string | null;
}

function spanOfDays(days: (string | null | undefined)[], rows: number): Coverage {
  const clean = days.filter((d): d is string => !!d).sort();
  return { rows, first: clean[0] ?? null, last: clean[clean.length - 1] ?? null };
}

export function buildManifest(
  input: BundleInput,
  stats: LifeStats,
  ctx: Ctx,
  expectationRows: number
): string {
  const { db, streams } = input;
  const toDayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

  const coverage: Record<string, Coverage> = {
    "items.csv": spanOfDays(db.items.map((i) => toDayOf(i.createdAt)), db.items.length),
    "actions.csv": spanOfDays(db.actions.map((a) => a.date), db.actions.length),
    "logs.csv": spanOfDays(db.logs.map((l) => l.date), db.logs.length),
    "journal.csv": spanOfDays(db.journal.map((j) => j.date), db.journal.length),
    "reflections.csv": spanOfDays(db.reflections.map((r) => r.periodKey), db.reflections.length),
    "habit_days.csv": spanOfDays(db.habitDayNotes.map((n) => n.date), db.habitDayNotes.length),
    "seeds.csv": spanOfDays(db.seeds.map((s) => toDayOf(s.createdAt)), db.seeds.length),
    "day_order.csv": spanOfDays(db.dayOrder.map((d) => d.date), db.dayOrder.length),
    "focus_sessions.csv": spanOfDays(
      streams.focusSessions.map((s) => s.day),
      streams.focusSessions.length
    ),
    "events.ndjson": spanOfDays(streams.events.map((e) => e.day), streams.events.length),
    "schedule_expectations.csv": {
      rows: expectationRows,
      first: stats.range?.start ?? null,
      last: stats.range?.end ?? null,
    },
  };

  const eventsFrom = coverage["events.ndjson"].first;

  return JSON.stringify(
    {
      app: "LoopUpward",
      schema_version: 2,
      generated_at: new Date(input.generatedAt).toISOString(),
      account: {
        storage: input.account.mode,
        email: input.account.email,
        created_at: input.account.createdAt ?? null,
      },

      /**
       * Null for a whole-life bundle. When set, every Record file below holds
       * only rows inside these days. items.csv, areas.csv and labels.csv still
       * carry rows from outside it, marked `in_window = false`, so that nothing
       * inside the window points at a name the bundle does not contain; and
       * items.csv carries `opening_value`, what each tracker read the moment
       * the window opened, without which a counter that moved 3 -> 7 inside it
       * cannot be told from one that started at zero.
       */
      window: ctx.window
        ? { start: ctx.window.start, end: ctx.window.end, label: ctx.window.label }
        : null,

      /* ——— what can be known, and from when ——— */
      coverage,

      /**
       * The single most important number for reading this bundle. Before this
       * day nothing was observed except the rows the tables happened to keep,
       * so: no page views, no focus sessions, no record of what an item was
       * called or aimed at before it reached its current values.
       */
      observation_begins: eventsFrom,
      observation_note: eventsFrom
        ? `Behavioural events and focus sessions exist from ${eventsFrom} onward. ` +
          `Zero counts in daily.csv before that day mean "not observed", not "did nothing". ` +
          `Historical item state (target, cadence, routine script) is reconstructable only from that day too; ` +
          `columns that cannot be established read "unknown" and their verdict columns are blank.`
        : "No behavioural events were ever recorded in this export.",

      /* ——— how timestamps were rendered ——— */
      timezone: {
        /**
         * recorded — the row stored the offset in force at that instant: exact.
         * profile  — read in the user's own timezone: right except while travelling.
         * exporter — no zone known; the exporting device's zone was used.
         */
        rendered_in: ctx.zoneName,
        source: ctx.zoneSource,
        profile_timezone: input.settings.timezone ?? null,
        exact_files: ["focus_sessions.csv", "events.ndjson"],
        assumed_files: [
          "items.csv", "actions.csv", "logs.csv", "areas.csv", "labels.csv",
          "seeds.csv", "habit_days.csv", "routine_steps.csv", "list_entries.csv",
          "day_order.csv", "journal.csv", "reflections.csv", "notes.csv",
        ],
      },

      /* ——— which files are evidence and which are computed from it ——— */
      file_roles: {
        record: [
          "logs.csv", "actions.csv", "focus_sessions.csv", "events.ndjson",
          "habit_days.csv", "routine_steps.csv", "seeds.csv", "list_entries.csv",
          "day_order.csv", "journal.csv", "journal.md", "reflections.csv",
          "reflections.md", "notes.csv", "notes.md",
        ],
        state_as_of_export: ["items.csv", "areas.csv", "labels.csv", "context.md"],
        derived: ["schedule_expectations.csv", "daily.csv", "summary.md"],
        documentation: ["README.md", "manifest.json"],
        complete_copy: ["raw.json"],
      },

      /**
       * Which weekday a week begins on, 0 = Sunday. Every `YYYY-Www` key in
       * this bundle is relative to it, so the two are meaningless apart: with
       * the Monday default the keys are ISO-8601 exactly. If the user ever
       * changed this, `settings.changed` in events.ndjson records when.
       */
      week_starts_on: stats.weekStart,
      week_starts_on_name: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][stats.weekStart],

      /* ——— vocabularies, so no coded column has to be guessed at ——— */
      vocabularies: {
        item_kind: [
          "note", "folder", "quote", "idea", "dream", "goal", "habit", "routine",
          "list", "project", "book", "milestone", "principle", "promise", "lesson", "memory",
        ],
        tracker: ["none", "check", "counter", "percent", "money", "habit", "book"],
        item_status: ["active", "done", "someday", "archived"],
        horizon: ["someday", "life", "year", "quarter", "month", "week", "today", "date"],
        cadence: ["daily", "weekdays", "days", "weekly", "monthly"],
        log_source: [
          "manual", "today_check", "item_page", "focus_timer", "routine_run",
          "parent_cascade", "import", "unknown",
        ],
        focus_kind: ["focus", "routine_step", "routine_run", "day_run", "rest"],
        focus_outcome: ["completed", "abandoned", "skipped", "interrupted", "expired"],
        seed_status: ["inbox", "later", "archived"],
        expectation: ["required", "not_due", "eligible", "unknown"],
        action_origin: ["manual", "plan_sheet", "goal_piece", "suggestion", "quick_task"],
        item_origin: ["manual", "suggestion", "routine_template"],
        known_source: ["recorded", "unknown"],
        event_type: [...EVENT_TYPES],
      },
    },
    null,
    2
  );
}
