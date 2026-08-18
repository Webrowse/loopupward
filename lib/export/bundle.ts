/**
 * The export bundle: a folder of files a person can read, and a tool can parse,
 * without ever opening this app again.
 *
 * Built here, on the client, for BOTH modes. A signed-in user's rows arrive
 * from GET /v1/export; a signed-out user's come straight out of localStorage.
 * One generator means the two bundles are identical in shape and in wording,
 * which is the requirement — and it means summary.md is computed by the same
 * lib/stats.ts the app itself uses, rather than by a second implementation on
 * the server that would drift from it within a month.
 *
 * Nothing in here calls anything. The app has no model, no provider, no key,
 * and this file is the reason: the deliverable is the data, handed to the
 * user, for the user to ask their own questions of, wherever they like.
 */

import { isoWithOffset, localTime, weekdayName } from "../clock";
import { daysBetween, toDay } from "../dates";
import { dayLogged, formatEntryAmount, habitDailyTarget, routineMinutes } from "../progress";
import { scoreIntentions } from "../review";
import { computeStats, LifeStats } from "../stats";
import { DB, Item, Streams, UserSettings } from "../types";
import { csvFile, CsvValue, dayWeekday, minutesOf, timeColumns, timeHeaders } from "./csv";
import { buildReadme } from "./readme";

export interface BundleInput {
  db: DB;
  streams: Streams;
  settings: UserSettings;
  account: { email: string | null; mode: "cloud" | "local" };
  /** epoch ms — passed in so a test can produce a stable bundle */
  generatedAt: number;
  today: string;
}

export interface BundleFile {
  name: string;
  content: string;
}

/** Everything the bundle contains, in the order a reader should meet it. */
export function buildBundle(input: BundleInput): BundleFile[] {
  const stats = computeStats({
    db: input.db,
    streams: input.streams,
    settings: input.settings,
    today: input.today,
  });

  return [
    { name: "README.md", content: buildReadme(input, stats) },
    { name: "context.md", content: contextMd(input) },
    { name: "summary.md", content: summaryMd(input, stats) },

    { name: "areas.csv", content: areasCsv(input) },
    { name: "items.csv", content: itemsCsv(input) },
    { name: "actions.csv", content: actionsCsv(input) },
    { name: "logs.csv", content: logsCsv(input) },
    { name: "focus_sessions.csv", content: focusSessionsCsv(input) },
    { name: "habit_days.csv", content: habitDaysCsv(input) },
    { name: "routine_steps.csv", content: routineStepsCsv(input) },
    { name: "list_entries.csv", content: listEntriesCsv(input) },
    { name: "seeds.csv", content: seedsCsv(input) },
    { name: "labels.csv", content: labelsCsv(input) },
    { name: "day_order.csv", content: dayOrderCsv(input) },
    { name: "daily.csv", content: dailyCsv(stats) },
    { name: "events.ndjson", content: eventsNdjson(input) },

    { name: "journal.md", content: journalMd(input) },
    { name: "reflections.md", content: reflectionsMd(input) },
    { name: "notes.md", content: notesMd(input) },

    { name: "raw.json", content: rawJson(input) },
  ];
}

/** The file name the download is offered under. */
export function bundleFilename(generatedAt: number): string {
  return `loopupward-export-${toDay(new Date(generatedAt))}.zip`;
}

/* ————— lookups shared by every file —————
 *
 * Every CSV is fully denormalized: an item's title and its area's name sit on
 * the row itself, not behind a join. A file that needs another file open to
 * be understood is a file the reader will skip.
 */

interface Lookups {
  itemById: Map<string, Item>;
  areaName: (item: Item | null | undefined) => string;
  areaIdOf: (item: Item | null | undefined) => string;
  itemTitle: (id: string | null | undefined) => string;
  labelNames: (ids: string[]) => string;
}

function lookups(db: DB): Lookups {
  const itemById = new Map(db.items.map((i) => [i.id, i]));
  const areaById = new Map(db.areas.map((a) => [a.id, a]));
  const labelById = new Map(db.labels.map((l) => [l.id, l]));

  // an item inherits its area from whatever it is nested inside, the same way
  // the app reads it, so an exported row never says "unfiled" about something
  // that plainly lives somewhere
  const resolveArea = (item: Item | null | undefined): string | null => {
    let cur = item ?? null;
    const seen = new Set<string>();
    while (cur) {
      if (cur.areaId) return cur.areaId;
      if (!cur.parentId || seen.has(cur.parentId)) return null;
      seen.add(cur.parentId);
      cur = itemById.get(cur.parentId) ?? null;
    }
    return null;
  };

  return {
    itemById,
    areaIdOf: (item) => resolveArea(item) ?? "",
    areaName: (item) => {
      const id = resolveArea(item);
      return id ? areaById.get(id)?.name ?? "(deleted area)" : "";
    },
    itemTitle: (id) => (id ? itemById.get(id)?.title ?? "(deleted item)" : ""),
    labelNames: (ids) => ids.map((id) => labelById.get(id)?.name ?? "(deleted label)").join(" | "),
  };
}

/* ————— narrative ————— */

function contextMd(input: BundleInput): string {
  const { settings, db } = input;
  const out: string[] = [];
  const line = (label: string, value: string | number | null | undefined) => {
    if (value === null || value === undefined || value === "") return;
    out.push(`**${label}:** ${value}`, "");
  };

  out.push("# Context", "");
  out.push(
    "Who this data belongs to and what they were trying to do, in their own words.",
    "Everything here is optional and was typed by the user; blank means not filled in,",
    "which is not the same as zero.",
    ""
  );

  out.push("## The person", "");
  line("Trying to become", settings.becoming);
  line("Season of life", settings.seasonOfLife);
  line("Occupation", settings.occupation);
  line("Genuinely in the way right now", settings.constraints);
  if (!settings.becoming && !settings.seasonOfLife && !settings.occupation && !settings.constraints) {
    out.push("_Not filled in._", "");
  }

  out.push("## The clock", "");
  line("Timezone", settings.timezone ?? "(not recorded)");
  line("Week starts on", weekdayLabel(settings.weekStart));
  line("A day rolls over at", `${settings.dayRolloverHour ?? 4}:00 local`);
  line("Usually awake", settings.wakeTime && settings.sleepTime ? `${settings.wakeTime} – ${settings.sleepTime}` : null);

  out.push("## What they were aiming at", "");
  line("Focus minutes per day", settings.focusMinutesTarget);
  line("Habit days per week", settings.habitDaysTarget);
  line("Deep work days per week", settings.deepWorkDaysTarget);
  if (
    settings.focusMinutesTarget == null &&
    settings.habitDaysTarget == null &&
    settings.deepWorkDaysTarget == null
  ) {
    out.push("_No targets set. The numbers in summary.md stand on their own._", "");
  }

  out.push("## Areas of life", "");
  if (db.areas.length === 0) {
    out.push("_No areas defined._", "");
  } else {
    for (const area of [...db.areas].sort((a, b) => a.position - b.position)) {
      out.push(`### ${area.emoji} ${area.name}`, "");
      if (area.description?.trim()) out.push(area.description.trim(), "");
      if (area.whyItMatters?.trim()) out.push(`**Why it matters:** ${area.whyItMatters.trim()}`, "");
      if (area.targetShare != null) {
        out.push(`**Meant to get:** ${Math.round(area.targetShare * 100)}% of attention`, "");
      }
      if (!area.description?.trim() && !area.whyItMatters?.trim() && area.targetShare == null) {
        out.push("_No description written._", "");
      }
    }
  }

  return out.join("\n");
}

function weekdayLabel(n: number | null | undefined): string | null {
  if (n == null) return null;
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][n] ?? null;
}

function pct(v: number | null): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}

function hourLabel(h: number | null): string {
  if (h == null) return "—";
  return `${String(h).padStart(2, "0")}:00`;
}

function summaryMd(input: BundleInput, stats: LifeStats): string {
  const out: string[] = [];
  const table = (header: string[], rows: (string | number)[][]) => {
    if (rows.length === 0) {
      out.push("_Nothing recorded._", "");
      return;
    }
    out.push(`| ${header.join(" | ")} |`);
    out.push(`| ${header.map(() => "---").join(" | ")} |`);
    for (const r of rows) out.push(`| ${r.join(" | ")} |`);
    out.push("");
  };

  out.push("# Summary", "");
  out.push(
    `Every number below is plain counting over the files in this bundle. Nothing here`,
    `is inferred, weighted or smoothed — if a figure looks wrong, the rows that made it`,
    `are in the CSVs and you can redo the arithmetic yourself.`,
    ""
  );
  if (stats.range) {
    out.push(`**Covering:** ${stats.range.start} to ${stats.range.end} (${stats.daysCovered} days)`, "");
  }
  out.push(`**A day rolls over at:** ${stats.dayRolloverHour}:00 local — see README.md`, "");

  out.push("## The shape of it", "");
  table(
    ["", "Count"],
    [
      ["Tasks planned", stats.actionsPlanned],
      ["Tasks completed", stats.actionsCompleted],
      ["Completion rate", pct(stats.completionRate)],
      ["Habit / routine days logged", stats.habitDaysLogged],
      ["Days journalled", `${stats.journalDaysWritten} (${pct(stats.journalCoverage)} of days)`],
      ["Items created", stats.itemsCreated],
      ["Items completed", stats.itemsCompleted],
      [
        "Created per completed",
        stats.accumulationRatio == null
          ? "— (nothing completed yet)"
          : `${stats.accumulationRatio}${stats.accumulationRatio > 1 ? " — arriving faster than they leave" : ""}`,
      ],
    ]
  );

  out.push("## Planned vs actual focus time", "");
  out.push(
    "The ratio is actual ÷ planned. Above 1 means it took longer than expected;",
    "below 1 means it finished early or was cut short. This is usually the most",
    "interesting number in the export.",
    "",
    "The totals count focus blocks and routine steps. A whole routine run holds",
    "the steps inside it, so its minutes are their minutes again — the routine",
    "rows below are a separate view of the same time, not more of it.",
    ""
  );
  table(
    ["", "Sessions", "Planned min", "Actual min", "Ratio"],
    [
      [
        "All focused work",
        stats.focusOverall.sessions,
        stats.focusOverall.plannedMinutes,
        stats.focusOverall.actualMinutes,
        stats.focusOverall.ratio ?? "—",
      ],
      ...stats.focusByRoutine.slice(0, 10).map((r) => [
        `Routine: ${r.label}`, r.sessions, r.plannedMinutes, r.actualMinutes, r.ratio ?? "—",
      ]),
      ...stats.focusByItem.slice(0, 10).map((r) => [
        r.label, r.sessions, r.plannedMinutes, r.actualMinutes, r.ratio ?? "—",
      ]),
    ]
  );

  out.push("## When things actually happen", "");
  table(
    ["", "Recorded", "Busiest hour"],
    [
      ["Tasks completed", stats.actionsCompletedByTime.total, hourLabel(stats.actionsCompletedByTime.peakHour)],
      ["Habits logged", stats.habitsLoggedByTime.total, hourLabel(stats.habitsLoggedByTime.peakHour)],
      ["Focus sessions started", stats.focusStartedByTime.total, hourLabel(stats.focusStartedByTime.peakHour)],
      ["Routine steps ticked", stats.routineStepsByTime.total, hourLabel(stats.routineStepsByTime.peakHour)],
    ]
  );
  out.push("Full hour-by-hour and weekday breakdowns are derivable from the CSVs:", "");
  out.push("- `actions.csv` → `done_local_time`, `done_weekday`");
  out.push("- `logs.csv` → `logged_local_time`, `logged_weekday`");
  out.push("- `focus_sessions.csv` → `started_local_time`, `started_weekday`");
  out.push("- `routine_steps.csv` → `done_local_time`, `done_weekday`", "");

  out.push("## Starting versus finishing", "");
  const a = stats.abandonment;
  table(
    ["", "Count"],
    [
      ["Focus sessions started", a.sessionsStarted],
      ["…completed", a.sessionsCompleted],
      ["…abandoned (closed mid-session)", a.sessionsAbandoned],
      ["…expired (countdown ran out, left running)", a.sessionsExpired],
      ["…skipped", a.sessionsSkipped],
      ["…interrupted (swapped for something else)", a.sessionsInterrupted],
      ["Completion rate", pct(a.completionRate)],
      ["Day runs started", a.dayRunsStarted],
      ["…finished", a.dayRunsFinished],
      ["…abandoned", a.dayRunsAbandoned],
      ["Steps done before abandoning, on average", a.avgStepsBeforeAbandon ?? "—"],
    ]
  );

  out.push("## What gets pushed", "");
  out.push(
    `**${stats.totalReschedules}** reschedules in total, **${stats.totalDaysSlipped}** days of slip.`,
    ""
  );
  table(
    ["Task", "Item", "Times moved", "Days slipped"],
    stats.reschedules.slice(0, 15).map((r) => [r.title, r.itemTitle ?? "—", r.times, r.daysSlipped])
  );

  out.push("## Per area", "");
  table(
    ["Area", "Planned", "Completed", "Rate"],
    stats.byArea.map((s) => [s.label, s.planned, s.completed, pct(s.rate)])
  );

  out.push("## Per kind", "");
  table(
    ["Kind", "Planned", "Completed", "Rate"],
    stats.byKind.map((s) => [s.label, s.planned, s.completed, pct(s.rate)])
  );

  if (stats.byLabel.length > 0) {
    out.push("## Per label", "");
    table(
      ["Label", "Planned", "Completed", "Rate"],
      stats.byLabel.map((s) => [s.label, s.planned, s.completed, pct(s.rate)])
    );
  }

  out.push("## Streaks, and where they break", "");
  table(
    ["Habit / routine", "Days logged", "Current streak", "Longest", "Breaks most often on"],
    stats.streaks.map((s) => [s.title, s.daysLogged, s.currentStreak, s.longestStreak, s.worstWeekday ?? "—"])
  );

  out.push("## How long things take to start and finish", "");
  table(
    ["Kind", "Items", "Median days to first action", "Median days to completion"],
    stats.leadTimeByKind.map((l) => [
      l.label, l.count, l.medianToFirstAction ?? "—", l.medianToCompletion ?? "—",
    ])
  );

  out.push("## Routine step reliability", "");
  out.push(
    "`Run ended here` counts days where this was the last step ticked and the script",
    "was left unfinished — in other words, where the routine tends to die.",
    ""
  );
  table(
    ["Routine", "#", "Step", "Done", "Skipped", "Run ended here", "Planned min", "Median actual min"],
    stats.stepReliability
      .filter((s) => s.timesDone + s.timesSkipped + s.timesRunEndedHere > 0)
      .slice(0, 30)
      .map((s) => [
        s.routineTitle, s.position + 1, s.stepTitle + (s.optional ? " (optional)" : ""),
        s.timesDone, s.timesSkipped, s.timesRunEndedHere,
        s.plannedMinutes ?? "—", s.actualMinutesMedian ?? "—",
      ])
  );

  out.push("## What is sitting open", "");
  table(["Age", "Open items"], stats.openItemAges.map((b) => [b.label, b.count]));
  if (stats.oldestUntouched.length > 0) {
    out.push("### Never touched", "");
    out.push("Open items with no action ever planned against them and nothing ever logged.", "");
    table(
      ["Item", "Kind", "Age (days)"],
      stats.oldestUntouched.slice(0, 15).map((i) => [i.title, i.kind, i.ageDays])
    );
  }

  out.push("## Arrivals per week", "");
  table(
    ["Week", "Created", "Completed"],
    stats.introductions.slice(-26).map((w) => [w.week, w.created, w.completed])
  );

  return out.join("\n");
}

/* ————— raw streams ————— */

function areasCsv(input: BundleInput): string {
  const header = [
    "area_id", "name", "emoji", "color", "position", "description", "why_it_matters",
    "target_share", ...timeHeaders("created"),
  ];
  const rows: CsvValue[][] = [...input.db.areas]
    .sort((a, b) => a.position - b.position)
    .map((a) => [
      a.id, a.name, a.emoji, a.color, a.position, a.description ?? "", a.whyItMatters ?? "",
      a.targetShare ?? "", ...timeColumns(a.createdAt),
    ]);
  return csvFile(header, rows);
}

function itemsCsv(input: BundleInput): string {
  const L = lookups(input.db);
  const header = [
    "item_id", "title", "kind", "tracker", "status", "area_id", "area_name",
    "parent_id", "parent_title", "horizon", "horizon_period", "date_repeats_yearly",
    "target", "current", "unit", "progress_fraction", "cadence", "cadence_days",
    "cadence_count", "window_start", "window_end", "pulled_today", "pinned", "labels",
    "note", "step_count", "planned_minutes", "entry_count",
    ...timeHeaders("created"), ...timeHeaders("completed"), ...timeHeaders("deleted"),
    "age_days", "days_to_complete",
  ];
  const rows: CsvValue[][] = input.db.items.map((i) => {
    const createdDay = toDay(new Date(i.createdAt));
    const doneDay = i.completedAt ? toDay(new Date(i.completedAt)) : null;
    return [
      i.id, i.title, i.kind, i.tracker, i.status,
      L.areaIdOf(i), L.areaName(i),
      i.parentId ?? "", L.itemTitle(i.parentId),
      i.horizon ?? "", i.horizonPeriod ?? "", i.dateRepeatsYearly,
      i.target ?? "", i.current, i.unit ?? "",
      i.target && i.target > 0 ? Math.round((i.current / i.target) * 1000) / 1000 : "",
      i.cadence ?? "", (i.cadenceDays ?? []).join(" "), i.cadenceCount ?? "",
      i.windowStart ?? "", i.windowEnd ?? "", i.pulledToday, i.pinned,
      L.labelNames(i.labels), i.note,
      i.steps?.length ?? "", routineMinutes(i) ?? "", i.entries?.length ?? "",
      ...timeColumns(i.createdAt), ...timeColumns(i.completedAt), ...timeColumns(i.deletedAt),
      Math.max(0, daysBetween(createdDay, input.today)),
      doneDay ? Math.max(0, daysBetween(createdDay, doneDay)) : "",
    ];
  });
  return csvFile(header, rows);
}

function actionsCsv(input: BundleInput): string {
  const L = lookups(input.db);
  const header = [
    "action_id", "title", "planned_day", "planned_weekday", "done", ...timeHeaders("done"),
    "days_late", "item_id", "item_title", "item_kind", "area_name", "amount", "priority", "note",
    ...timeHeaders("created"),
  ];
  const rows: CsvValue[][] = [...input.db.actions]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt))
    .map((a) => {
      const item = a.itemId ? L.itemById.get(a.itemId) ?? null : null;
      const doneDay = a.doneAt ? toDay(new Date(a.doneAt)) : null;
      return [
        a.id, a.title, a.date, dayWeekday(a.date), a.done, ...timeColumns(a.doneAt),
        // negative means finished ahead of the day it was planned for
        doneDay ? daysBetween(a.date, doneDay) : "",
        a.itemId ?? "", item?.title ?? "", item?.kind ?? "", L.areaName(item),
        a.amount, a.priority, a.note, ...timeColumns(a.createdAt),
      ];
    });
  return csvFile(header, rows);
}

function logsCsv(input: BundleInput): string {
  const L = lookups(input.db);
  const header = [
    "log_id", "day", "weekday", "item_id", "item_title", "item_kind", "area_name",
    "op", "value", "source", "via", ...timeHeaders("logged"),
  ];
  const rows: CsvValue[][] = [...input.db.logs]
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((l) => {
      const item = L.itemById.get(l.itemId) ?? null;
      return [
        l.id, l.date, dayWeekday(l.date), l.itemId, item?.title ?? "(deleted item)",
        item?.kind ?? "", L.areaName(item),
        l.op, l.value, l.source ?? "unknown", l.via ?? "", ...timeColumns(l.createdAt),
      ];
    });
  return csvFile(header, rows);
}

function focusSessionsCsv(input: BundleInput): string {
  const L = lookups(input.db);
  const header = [
    "session_id", "day", "weekday", "kind", "outcome", "item_id", "item_title", "area_name",
    "step_id", "step_title", "entry_id",
    ...timeHeaders("started"), ...timeHeaders("ended"),
    "planned_minutes", "actual_minutes", "paused_minutes", "pause_count",
    "over_under_ratio", "timezone", "utc_offset_minutes",
  ];
  const rows: CsvValue[][] = [...input.streams.focusSessions]
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((s) => {
      const item = s.itemId ? L.itemById.get(s.itemId) ?? null : null;
      const stepTitle = s.stepId ? item?.steps?.find((st) => st.id === s.stepId)?.title ?? "" : "";
      return [
        s.id, s.day, dayWeekday(s.day), s.kind, s.outcome,
        s.itemId ?? "", item?.title ?? "", L.areaName(item),
        s.stepId ?? "", stepTitle, s.entryId,
        ...timeColumns(s.startedAt), ...timeColumns(s.endedAt),
        minutesOf(s.plannedSeconds), minutesOf(s.actualSeconds), minutesOf(s.pausedSeconds),
        s.pauseCount,
        s.plannedSeconds ? Math.round((s.actualSeconds / s.plannedSeconds) * 100) / 100 : "",
        s.tz, s.utcOffsetMinutes,
      ];
    });
  return csvFile(header, rows);
}

/**
 * What each habit or routine meant on one specific day.
 *
 * "Clean" is the habit; "clean the side desk" is what it meant on Tuesday, and
 * that sentence is the human half of the record. It used to survive only in
 * raw.json, because routine_steps.csv skips anything without a script — so a
 * plain habit's day plans, which is most of them, reached no readable file at
 * all.
 */
function habitDaysCsv(input: BundleInput): string {
  const L = lookups(input.db);
  const header = [
    "item_id", "item_title", "kind", "area_name", "day", "weekday", "day_plan",
    "logged", "value_logged", "daily_target", "steps_done", "steps_total",
    ...timeHeaders("first_written"), ...timeHeaders("last_updated"),
  ];
  const rows: CsvValue[][] = [...input.db.habitDayNotes]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((n) => {
      const item = L.itemById.get(n.itemId) ?? null;
      const target = item ? habitDailyTarget(item) : 1;
      const value = dayLogged(input.db.logs, n.itemId, n.date);
      return [
        n.itemId, item?.title ?? "(deleted item)", item?.kind ?? "", L.areaName(item),
        n.date, dayWeekday(n.date), n.text,
        value >= target, value, target,
        n.doneSteps?.length ?? "", item?.steps?.length ?? "",
        ...timeColumns(n.createdAt), ...timeColumns(n.updatedAt),
      ];
    });
  return csvFile(header, rows);
}

function routineStepsCsv(input: BundleInput): string {
  const L = lookups(input.db);
  const header = [
    "routine_id", "routine_title", "area_name", "day", "weekday", "step_id", "step_title",
    "position", "optional", "planned_minutes", "done", ...timeHeaders("done"),
    "tick_order", "linked_item_id", "linked_item_title", "day_plan_note",
  ];
  const rows: CsvValue[][] = [];
  for (const note of [...input.db.habitDayNotes].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    const routine = L.itemById.get(note.itemId);
    if (!routine?.steps?.length) continue;
    const done = new Set(note.doneSteps ?? []);
    const at = note.doneStepsAt ?? {};
    // the order the script was really walked in, which is not the order it is
    // written in — this is exactly what doneSteps alone could never say
    const ticked = Object.entries(at).sort((a, b) => a[1] - b[1]).map(([id]) => id);
    routine.steps.forEach((step, position) => {
      const tickedAt = at[step.id] ?? null;
      rows.push([
        routine.id, routine.title, L.areaName(routine), note.date, dayWeekday(note.date),
        step.id, step.title, position, !!step.optional, step.minutes ?? "",
        done.has(step.id), ...timeColumns(tickedAt),
        tickedAt ? ticked.indexOf(step.id) + 1 : "",
        step.itemId ?? "", L.itemTitle(step.itemId), note.text,
      ]);
    });
  }
  return csvFile(header, rows);
}

function listEntriesCsv(input: BundleInput): string {
  const L = lookups(input.db);
  const header = [
    "list_id", "list_title", "area_name", "entry_id", "position", "text", "amount", "unit",
    "formatted_amount", "done", ...timeHeaders("picked"), "days_being_tried",
  ];
  const rows: CsvValue[][] = [];
  for (const item of input.db.items) {
    if (!item.entries?.length) continue;
    item.entries.forEach((e, position) => {
      rows.push([
        item.id, item.title, L.areaName(item), e.id, position, e.text,
        e.amount ?? "", e.unit ?? "",
        e.amount != null ? formatEntryAmount(e.amount, e.unit) : "",
        e.done, ...timeColumns(e.pickedAt),
        e.pickedAt ? Math.max(0, daysBetween(toDay(new Date(e.pickedAt)), input.today)) : "",
      ]);
    });
  }
  return csvFile(header, rows);
}

function seedsCsv(input: BundleInput): string {
  const L = lookups(input.db);
  const header = [
    "seed_id", "text", "status", ...timeHeaders("captured"), ...timeHeaders("archived"),
    "became_item_id", "became_item_title", "days_resting",
  ];
  const rows: CsvValue[][] = [...input.db.seeds]
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((s) => [
      s.id, s.text, s.status, ...timeColumns(s.createdAt), ...timeColumns(s.archivedAt),
      s.itemId ?? "", L.itemTitle(s.itemId),
      Math.max(0, daysBetween(toDay(new Date(s.createdAt)), toDay(new Date(s.archivedAt ?? Date.now())))),
    ]);
  return csvFile(header, rows);
}

function labelsCsv(input: BundleInput): string {
  const header = ["label_id", "name", "emoji", "color", "position", "items_tagged", ...timeHeaders("created")];
  const rows: CsvValue[][] = [...input.db.labels]
    .sort((a, b) => a.position - b.position)
    .map((l) => [
      l.id, l.name, l.emoji, l.color, l.position,
      input.db.items.filter((i) => i.labels.includes(l.id)).length,
      ...timeColumns(l.createdAt),
    ]);
  return csvFile(header, rows);
}

function dayOrderCsv(input: BundleInput): string {
  const header = ["day", "weekday", "position", "entry_id", "entry_kind", ...timeHeaders("updated")];
  const rows: CsvValue[][] = [];
  for (const d of [...input.db.dayOrder].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    d.order.forEach((entryId, position) => {
      // the app's Today list mixes real tasks with rows generated from an
      // item's schedule; the id shape is the only thing that tells them apart
      const kind = entryId.startsWith("habit:")
        ? "habit"
        : entryId.startsWith("today-item:")
          ? "item"
          : "action";
      rows.push([d.date, dayWeekday(d.date), position, entryId, kind, ...timeColumns(d.updatedAt)]);
    });
  }
  return csvFile(header, rows);
}

function dailyCsv(stats: LifeStats): string {
  const header = [
    "day", "weekday", "journal_written", "mood", "energy", "sleep_hours", "sleep_quality",
    "stress", "focus_rating", "has_gratitude", "has_intention",
    "actions_planned", "actions_completed", "habit_days_logged", "routine_days_logged",
    "focus_sessions", "focus_minutes_planned", "focus_minutes_actual",
    "focus_sessions_abandoned", "pause_count",
    "app_opens", "first_open_local", "last_write_local", "distinct_routes", "events",
  ];
  const rows: CsvValue[][] = stats.daily.map((d) => [
    d.day, d.weekday, d.journalWritten, d.mood, d.energy, d.sleepHours, d.sleepQuality,
    d.stress, d.focusRating, d.hasGratitude, d.hasIntention,
    d.actionsPlanned, d.actionsCompleted, d.habitDaysLogged, d.routineDaysLogged,
    d.focusSessions, d.focusMinutesPlanned, d.focusMinutesActual,
    d.focusSessionsAbandoned, d.pauseCount,
    d.appOpens, d.firstOpenLocal, d.lastWriteLocal, d.distinctRoutes, d.events,
  ]);
  return csvFile(header, rows);
}

function eventsNdjson(input: BundleInput): string {
  const L = lookups(input.db);
  return (
    [...input.streams.events]
      .sort((a, b) => a.at - b.at)
      .map((e) =>
        JSON.stringify({
          id: e.id,
          type: e.type,
          at: isoWithOffset(e.at),
          at_ms: e.at,
          local_time: localTime(e.at),
          weekday: weekdayName(e.at),
          day: e.day,
          timezone: e.tz,
          utc_offset_minutes: e.utcOffsetMinutes,
          item_id: e.itemId,
          // denormalized like every CSV: a line of this file should be
          // readable on its own, without another file open beside it
          item_title: e.itemId ? L.itemTitle(e.itemId) : null,
          payload: e.payload,
        })
      )
      .join("\n") + "\n"
  );
}

/* ————— human text ————— */

function journalMd(input: BundleInput): string {
  const out: string[] = ["# Journal", ""];
  const entries = [...input.db.journal].sort((a, b) => (a.date < b.date ? -1 : 1));
  if (entries.length === 0) {
    out.push("_No entries._", "");
    return out.join("\n");
  }
  out.push(`${entries.length} entries, oldest first.`, "");
  for (const j of entries) {
    out.push(`## ${j.date} · ${dayWeekday(j.date)}`, "");
    const facts: string[] = [];
    if (j.mood != null) facts.push(`mood ${j.mood}/5`);
    if (j.energy != null) facts.push(`energy ${j.energy}/5`);
    if (j.sleepHours != null) facts.push(`slept ${j.sleepHours}h`);
    if (j.sleepQuality != null) facts.push(`sleep quality ${j.sleepQuality}/5`);
    if (j.stress != null) facts.push(`stress ${j.stress}/5`);
    if (j.focus != null) facts.push(`focus ${j.focus}/5`);
    if (facts.length) out.push(`_${facts.join(" · ")}_`, "");
    if (j.tags?.length) out.push(`Tags: ${j.tags.join(", ")}`, "");
    if (j.intention?.trim()) out.push(`**One thing that would make today good:** ${j.intention.trim()}`, "");
    if (j.roughNotes.trim()) out.push(j.roughNotes.trim(), "");
    if (j.endOfDay.trim()) out.push("**End of day**", "", j.endOfDay.trim(), "");
    if (j.gratitude?.trim()) out.push(`**Grateful for:** ${j.gratitude.trim()}`, "");
    out.push("---", "");
  }
  return out.join("\n");
}

function reflectionsMd(input: BundleInput): string {
  const { db } = input;
  const out: string[] = ["# Reflections", ""];
  const reflections = [...db.reflections].sort((a, b) =>
    a.periodKey < b.periodKey ? -1 : a.periodKey > b.periodKey ? 1 : 0
  );
  if (reflections.length === 0) {
    out.push("_No reflections written._", "");
    return out.join("\n");
  }
  out.push(
    "Each period's own words, followed by how the intentions it set actually went.",
    "That scoring is plain counting against the items each intention named — see",
    "README.md for exactly what was counted.",
    ""
  );

  for (const r of reflections) {
    out.push(`## ${r.periodKey} (${r.period})`, "");
    if (r.ratings) {
      const bits: string[] = [];
      if (r.ratings.overall != null) bits.push(`overall ${r.ratings.overall}/5`);
      if (r.ratings.energy != null) bits.push(`energy ${r.ratings.energy}/5`);
      if (r.ratings.progress != null) bits.push(`progress ${r.ratings.progress}/5`);
      if (bits.length) out.push(`_${bits.join(" · ")}_`, "");
    }
    if (r.text.trim()) out.push(r.text.trim(), "");
    const bullets = (label: string, list: string[] | undefined) => {
      if (!list?.length) return;
      out.push(`**${label}**`, "");
      for (const line of list) out.push(`- ${line}`);
      out.push("");
    };
    bullets("Wins", r.wins);
    bullets("Lessons", r.lessons);
    bullets("Blockers", r.blockers);

    if (r.areaNotes && Object.keys(r.areaNotes).length > 0) {
      out.push("**By area**", "");
      for (const [areaId, note] of Object.entries(r.areaNotes)) {
        const area = db.areas.find((a) => a.id === areaId);
        const rating = note.rating != null ? ` — ${note.rating}/5` : "";
        out.push(`- **${area ? `${area.emoji} ${area.name}` : "(deleted area)"}**${rating}: ${note.note}`);
      }
      out.push("");
    }

    if (r.intentions?.length) {
      out.push("**Intentions set for the next period**", "");
      // scored against the period that followed this one, by counting
      const next = nextPeriodRange(r.period, r.periodKey);
      const scored = next ? scoreIntentions(db, r.intentions, next.start, next.end) : [];
      r.intentions.forEach((intention, i) => {
        const s = scored[i];
        if (!s || s.met === null) {
          out.push(`- ${intention.text} — _nothing countable named, so not scored_`);
          return;
        }
        const target = intention.targetValue != null ? ` of ${intention.targetValue}` : "";
        const unit = s.measure === "days" ? " days" : s.measure === "units" ? " units" : "";
        out.push(
          `- ${intention.text} — **${s.met ? "kept" : "not kept"}**: ` +
            `${s.itemTitle ?? "?"} reached ${s.achieved}${target}${unit}`
        );
      });
      out.push("");
    }
    out.push("---", "");
  }
  return out.join("\n");
}

/** The window a reflection's intentions were about: the period after it. */
function nextPeriodRange(
  period: "week" | "month" | "quarter" | "year",
  periodKey: string
): { start: string; end: string } | null {
  // periodKey is the app's own format: 2026-W28 / 2026-08 / 2026-Q3 / 2026
  const anchorOf = (): Date | null => {
    if (period === "year") {
      const y = Number(periodKey);
      return Number.isFinite(y) ? new Date(y, 0, 1) : null;
    }
    if (period === "quarter") {
      const [y, q] = periodKey.split("-Q");
      return Number(y) && Number(q) ? new Date(Number(y), (Number(q) - 1) * 3, 1) : null;
    }
    if (period === "month") {
      const [y, m] = periodKey.split("-");
      return Number(y) && Number(m) ? new Date(Number(y), Number(m) - 1, 1) : null;
    }
    const [y, w] = periodKey.split("-W");
    if (!Number(y) || !Number(w)) return null;
    // ISO week 1 contains January 4th; step from the Monday of that week
    const jan4 = new Date(Number(y), 0, 4);
    const monday = new Date(jan4);
    monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (Number(w) - 1) * 7);
    return monday;
  };
  const anchor = anchorOf();
  if (!anchor) return null;
  const start = new Date(anchor);
  const end = new Date(anchor);
  switch (period) {
    case "week":
      start.setDate(start.getDate() + 7);
      end.setDate(end.getDate() + 13);
      break;
    case "month":
      start.setMonth(start.getMonth() + 1);
      end.setMonth(end.getMonth() + 2);
      end.setDate(0);
      break;
    case "quarter":
      start.setMonth(start.getMonth() + 3);
      end.setMonth(end.getMonth() + 6);
      end.setDate(0);
      break;
    case "year":
      start.setFullYear(start.getFullYear() + 1);
      end.setFullYear(end.getFullYear() + 2);
      end.setDate(0);
      end.setMonth(11);
      end.setDate(31);
      break;
  }
  return { start: toDay(start), end: toDay(end) };
}

function notesMd(input: BundleInput): string {
  const L = lookups(input.db);
  const out: string[] = ["# Notes", ""];
  const notes = input.db.items
    .filter((i) => (i.kind === "note" || i.kind === "folder") && !i.deletedAt)
    .filter((i) => i.richBody?.trim() || i.note.trim())
    .sort((a, b) => a.createdAt - b.createdAt);
  if (notes.length === 0) {
    out.push("_No notes with content._", "");
    return out.join("\n");
  }
  out.push(
    `${notes.length} notes, oldest first. Bodies are the app's own markdown, unchanged.`,
    ""
  );
  for (const n of notes) {
    out.push(`## ${n.title}`, "");
    const area = L.areaName(n);
    out.push(
      `_${toDay(new Date(n.createdAt))}${area ? ` · ${area}` : ""}${n.labels.length ? ` · ${L.labelNames(n.labels)}` : ""}_`,
      ""
    );
    if (n.richBody?.trim()) out.push(n.richBody.trim(), "");
    else if (n.note.trim()) out.push(n.note.trim(), "");
    out.push("---", "");
  }
  return out.join("\n");
}

function rawJson(input: BundleInput): string {
  return JSON.stringify(
    {
      app: "LoopUpward",
      exportedAt: new Date(input.generatedAt).toISOString(),
      account: { email: input.account.email, storage: input.account.mode },
      settings: input.settings,
      data: {
        ...input.db,
        focusSessions: input.streams.focusSessions,
        events: input.streams.events,
      },
    },
    null,
    2
  );
}
