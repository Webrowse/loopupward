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

import { isoWithOffset, localTime, profileZone, weekdayName, ZoneRef, ZoneSource } from "../clock";
import { daysBetween, periodKey, Period, toDay } from "../dates";
import { dayLogged, formatEntryAmount, habitDailyTarget, routineMinutes } from "../progress";
import { scoreIntentions } from "../review";
import { computeStats, LifeStats } from "../stats";
import { DB, DEFAULT_WEEK_START, Item, Streams, UserSettings } from "../types";
import { csvFile, CsvValue, dayWeekday, minutesOf, timeColumnsZoned, timeHeaders } from "./csv";
import { buildHistory, dailyTargetAsOfDay, ItemHistory, stepIdsAsOfDay } from "./history";
import { buildExpectations, ExpectationRow } from "./expectations";
import { buildManifest } from "./manifest";
import { ExportWindow, OpeningValue, scopeToWindow } from "./window";
import { buildReadme } from "./readme";

export interface BundleInput {
  db: DB;
  streams: Streams;
  settings: UserSettings;
  account: { email: string | null; mode: "cloud" | "local"; createdAt?: string | null };
  /** epoch ms — passed in so a test can produce a stable bundle */
  generatedAt: number;
  today: string;
  /** when set, the bundle covers only this stretch: the same files and the
   *  same columns, filtered, plus the closure and opening balances that make a
   *  slice readable on its own. See lib/export/window.ts. */
  window?: ExportWindow | null;
}

export interface BundleFile {
  name: string;
  content: string;
}

/**
 * What every emitter needs and none of them should recompute: the zone
 * historical rows are read in, and the reconstruction of what items looked like
 * on days in the past. Both are derived once, here, because getting two files
 * to disagree about either would be worse than either being wrong.
 */
export interface Ctx {
  zone: ZoneRef;
  zoneSource: ZoneSource;
  /** the zone's name, for the manifest and the README */
  zoneName: string;
  history: ItemHistory;
  /** null for a whole-life bundle */
  window: ExportWindow | null;
  /** ids that belong to the window itself, as opposed to rows carried along so
   *  that nothing in the bundle points at something missing from it */
  inWindow: Set<string> | null;
  opening: Map<string, OpeningValue> | null;
}

export function buildCtx(input: BundleInput): Ctx {
  // rows that recorded their own offset get it used directly (see clock.ts);
  // everything else is read in the user's own zone, and the manifest says so
  const zone = profileZone(input.settings.timezone);
  return {
    zone,
    zoneSource: zone.kind,
    zoneName:
      zone.kind === "profile"
        ? zone.tz
        : Intl.DateTimeFormat().resolvedOptions().timeZone ?? "(unknown)",
    history: buildHistory(input.streams.events),
    window: null,
    inWindow: null,
    opening: null,
  };
}

/** Everything the bundle contains, in the order a reader should meet it. */
export function buildBundle(whole: BundleInput): BundleFile[] {
  // A scoped bundle is this same generator over less data, never a second one.
  // The history is still built from the FULL event stream, so an item's target
  // or script on a day inside the window can be reconstructed from a change
  // made long before it.
  const fullHistory = buildHistory(whole.streams.events);
  const scoped = whole.window ? scopeToWindow(whole.db, whole.streams, whole.window) : null;
  const input: BundleInput = scoped
    ? { ...whole, db: scoped.db, streams: scoped.streams }
    : whole;

  const stats = computeStats({
    db: input.db,
    streams: input.streams,
    settings: input.settings,
    today: input.today,
    range: whole.window ? { start: whole.window.start, end: whole.window.end } : undefined,
  });
  const ctx: Ctx = {
    ...buildCtx(input),
    history: fullHistory,
    window: whole.window ?? null,
    inWindow: scoped?.inWindow ?? null,
    opening: scoped?.opening ?? null,
  };
  const expectations = buildExpectations(
    input.db,
    ctx.history,
    whole.window ? { start: whole.window.start, end: whole.window.end } : stats.range,
    input.today
  );

  return [
    { name: "README.md", content: buildReadme(input, stats, ctx) },
    { name: "manifest.json", content: buildManifest(input, stats, ctx, expectations.length) },
    { name: "context.md", content: contextMd(input) },
    { name: "summary.md", content: summaryMd(input, stats) },

    { name: "areas.csv", content: areasCsv(input, ctx) },
    { name: "items.csv", content: itemsCsv(input, ctx) },
    { name: "actions.csv", content: actionsCsv(input, ctx) },
    { name: "logs.csv", content: logsCsv(input, ctx) },
    { name: "focus_sessions.csv", content: focusSessionsCsv(input) },
    { name: "habit_days.csv", content: habitDaysCsv(input, ctx) },
    { name: "routine_steps.csv", content: routineStepsCsv(input, ctx) },
    { name: "schedule_expectations.csv", content: expectationsCsv(input, expectations) },
    { name: "list_entries.csv", content: listEntriesCsv(input, ctx) },
    { name: "seeds.csv", content: seedsCsv(input, ctx) },
    { name: "labels.csv", content: labelsCsv(input, ctx) },
    { name: "day_order.csv", content: dayOrderCsv(input, ctx) },
    { name: "daily.csv", content: dailyCsv(stats) },
    { name: "events.ndjson", content: eventsNdjson(input) },

    { name: "journal.csv", content: journalCsv(input, ctx) },
    { name: "reflections.csv", content: reflectionsCsv(input, ctx) },
    { name: "notes.csv", content: notesCsv(input, ctx) },

    { name: "journal.md", content: journalMd(input) },
    { name: "reflections.md", content: reflectionsMd(input) },
    { name: "notes.md", content: notesMd(input) },

    { name: "raw.json", content: rawJson(input) },
  ];
}

/** The file name the download is offered under. */
export function bundleFilename(generatedAt: number, window?: ExportWindow | null): string {
  return window
    ? `loopupward-export-${window.start}-to-${window.end}.zip`
    : `loopupward-export-${toDay(new Date(generatedAt))}.zip`;
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

/**
 * How many whole week/month/quarter/year instances a period goal has rolled
 * through unfinished.
 *
 * The app carries an unfinished period goal into the current instance without
 * writing anything at all — it simply keeps appearing — so a goal set twenty
 * weeks ago and one set on Monday are identical rows. This is the difference,
 * counted from the instance it was actually filed under.
 */
function carriedPeriods(item: Item, today: string): number | "" {
  const period = item.horizon;
  if (period !== "week" && period !== "month" && period !== "quarter" && period !== "year") return "";
  if (!item.horizonPeriod) return "";
  const from = periodKey(period as Period, item.horizonPeriod);
  const now = periodKey(period as Period, today);
  if (from >= now) return 0;
  let n = 0;
  let cursor = item.horizonPeriod;
  // step forward one instance at a time rather than doing calendar arithmetic
  // per period type; a goal is never carried enough for this to be slow
  while (periodKey(period as Period, cursor) < now && n < 1000) {
    cursor = nextInstance(period as Period, cursor);
    n++;
  }
  return n;
}

function nextInstance(period: Period, anchor: string): string {
  const d = new Date(`${anchor}T12:00:00`);
  if (period === "week") d.setDate(d.getDate() + 7);
  else if (period === "month") d.setMonth(d.getMonth() + 1);
  else if (period === "quarter") d.setMonth(d.getMonth() + 3);
  else d.setFullYear(d.getFullYear() + 1);
  return toDay(d);
}

/** A row that recorded the offset in force at the time gets it used exactly. */
function recorded(offsetMinutes: number): ZoneRef {
  return { kind: "recorded", offsetMinutes };
}

/** A row that did not gets read in the user's own zone — see buildCtx. */
function timeColumnsZoned2(ctx: Ctx, at: number | null | undefined): [string, string, string] {
  return timeColumnsZoned(at, ctx.zone);
}

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/* ————— narrative ————— */

/**
 * The frame the numbers sit in: how this person's clock works, and what they
 * divided their life into.
 *
 * This file used to open with a self-description typed into a settings form:
 * what the user was becoming, their season of life, the targets they were
 * aiming at. That is gone on purpose. A standing answer to "who are you" is
 * undated, rewritten silently, and the least reliable claim in the bundle;
 * testing years of behaviour against whatever it happened to say on export day
 * invents divergences that never occurred.
 *
 * The same claims are still here, made where they cost something and carrying
 * the date they were made: `journal.md` has each day's one intention,
 * `reflections.md` has the wins, blockers and the promises each period set for
 * the next, and the areas below are the division of life the user actually
 * built and used. Read those for what mattered to them, and when.
 */
function contextMd(input: BundleInput): string {
  const { settings, db } = input;
  const out: string[] = [];
  const line = (label: string, value: string | number | null | undefined) => {
    if (value === null || value === undefined || value === "") return;
    out.push(`**${label}:** ${value}`, "");
  };

  out.push("# Context", "");
  out.push(
    "How to place this person's days, and what they divided their life into.",
    "",
    "There is no self-description in this file. What the person said mattered to them",
    "is in `journal.md` (each day's one intention), in `reflections.md` (wins, lessons,",
    "blockers, and the promises each period made for the next), and in the areas below.",
    "Those are dated, which a standing answer in a settings form never is.",
    ""
  );

  out.push("## The clock", "");
  line("Timezone", settings.timezone ?? "(not recorded)");
  line("Weeks start on", WEEKDAY_NAMES[settings.weekStart ?? DEFAULT_WEEK_START]);

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
  out.push(`**Weeks start on:** ${WEEKDAY_NAMES[stats.weekStart]} — see README.md`, "");

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

function areasCsv(input: BundleInput, ctx: Ctx): string {
  const header = [
    "area_id", "name", "emoji", "color", "position", "description", "why_it_matters",
    "target_share", ...timeHeaders("created"),
  ];
  const rows: CsvValue[][] = [...input.db.areas]
    .sort((a, b) => a.position - b.position)
    .map((a) => [
      a.id, a.name, a.emoji, a.color, a.position, a.description ?? "", a.whyItMatters ?? "",
      a.targetShare ?? "", ...timeColumnsZoned2(ctx, a.createdAt),
    ]);
  return csvFile(header, rows);
}

function itemsCsv(input: BundleInput, ctx: Ctx): string {
  const L = lookups(input.db);
  const header = [
    "item_id", "title", "kind", "tracker", "status", "area_id", "area_name",
    "parent_id", "parent_title", "horizon", "horizon_period", "date_repeats_yearly",
    "target", "current", "unit", "progress_fraction", "cadence", "cadence_days",
    "cadence_count", "window_start", "window_end", "pulled_today", "pinned", "labels",
    "note", "rich_body_chars", "carried_periods", "origin",
    "in_window", "opening_value",
    "step_count", "planned_minutes", "entry_count",
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
      i.richBody?.length ?? "",
      carriedPeriods(i, input.today),
      ctx.history.itemOrigin.get(i.id) ?? "",
      // on a scoped export: whether this row is part of the window, or is only
      // here so that something inside the window has a name to point at
      ctx.inWindow ? ctx.inWindow.has(i.id) : "",
      // what this tracker read when the window opened, so a counter that moved
      // 3 -> 7 inside it is not mistaken for one that started at zero
      ctx.opening ? ctx.opening.get(i.id)?.value ?? 0 : "",
      i.steps?.length ?? "", routineMinutes(i) ?? "", i.entries?.length ?? "",
      ...timeColumnsZoned2(ctx, i.createdAt), ...timeColumnsZoned2(ctx, i.completedAt), ...timeColumnsZoned2(ctx, i.deletedAt),
      Math.max(0, daysBetween(createdDay, input.today)),
      doneDay ? Math.max(0, daysBetween(createdDay, doneDay)) : "",
    ];
  });
  return csvFile(header, rows);
}

function actionsCsv(input: BundleInput, ctx: Ctx): string {
  const L = lookups(input.db);
  const header = [
    "action_id", "title", "planned_day", "planned_weekday", "done", ...timeHeaders("done"),
    "days_late", "carried_days", "origin",
    "item_id", "item_title", "item_kind", "area_name", "amount", "priority", "note",
    ...timeHeaders("created"),
  ];
  const rows: CsvValue[][] = [...input.db.actions]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt))
    .map((a) => {
      const item = a.itemId ? L.itemById.get(a.itemId) ?? null : null;
      const doneDay = a.doneAt ? toDay(new Date(a.doneAt)) : null;
      return [
        a.id, a.title, a.date, dayWeekday(a.date), a.done, ...timeColumnsZoned2(ctx, a.doneAt),
        // negative means finished ahead of the day it was planned for
        doneDay ? daysBetween(a.date, doneDay) : "",
        // how long it was actually carried: to the day it was done, or — if it
        // never was — to the day of this export. The app carries an unfinished
        // task forward silently, without changing its date and without an
        // event, so this column is the only place that postponement shows.
        Math.max(0, daysBetween(a.date, doneDay ?? input.today)),
        ctx.history.actionOrigin.get(a.id) ?? "",
        a.itemId ?? "", item?.title ?? "", item?.kind ?? "", L.areaName(item),
        a.amount, a.priority, a.note, ...timeColumnsZoned2(ctx, a.createdAt),
      ];
    });
  return csvFile(header, rows);
}

function logsCsv(input: BundleInput, ctx: Ctx): string {
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
        l.op, l.value, l.source ?? "unknown", l.via ?? "", ...timeColumnsZoned2(ctx, l.createdAt),
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
        ...timeColumnsZoned(s.startedAt, recorded(s.utcOffsetMinutes)),
        ...timeColumnsZoned(s.endedAt, recorded(s.utcOffsetMinutes)),
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
 * that sentence is the human half of the record.
 *
 * `daily_target` and `logged` used to be computed against the item's target as
 * it stands TODAY, so raising a water habit from two glasses to three quietly
 * turned every past two-glass day into a failure. They now use the target of
 * the day itself and go blank when that cannot be established, with
 * `daily_target_current` kept beside them so nothing is lost — an empty verdict
 * is a fact about the record, a wrong one is a fact about the person.
 */
function habitDaysCsv(input: BundleInput, ctx: Ctx): string {
  const L = lookups(input.db);
  const header = [
    "item_id", "item_title", "kind", "area_name", "day", "weekday", "day_plan",
    "logged", "value_logged", "daily_target", "daily_target_current", "target_source",
    "steps_done", "steps_total",
    ...timeHeaders("first_written"), ...timeHeaders("last_updated"),
  ];
  const rows: CsvValue[][] = [...input.db.habitDayNotes]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((n) => {
      const item = L.itemById.get(n.itemId) ?? null;
      const value = dayLogged(input.db.logs, n.itemId, n.date);
      const asOf = item
        ? dailyTargetAsOfDay(ctx.history, item, n.date)
        : { value: null as number | null, known: false };
      const currentTarget = item ? habitDailyTarget(item) : "";
      return [
        n.itemId, item?.title ?? "(deleted item)", item?.kind ?? "", L.areaName(item),
        n.date, dayWeekday(n.date), n.text,
        asOf.known && asOf.value != null ? value >= asOf.value : "",
        value,
        asOf.known ? asOf.value ?? "" : "",
        currentTarget,
        asOf.known ? "recorded" : "unknown",
        n.doneSteps?.length ?? "", item?.steps?.length ?? "",
        ...timeColumnsZoned2(ctx, n.createdAt), ...timeColumnsZoned2(ctx, n.updatedAt),
      ];
    });
  return csvFile(header, rows);
}

/**
 * One row per routine, per day, per step of the script THAT DAY.
 *
 * This file used to render every historical day against today's steps, so a
 * step added last week showed `done = false` on all the mornings before it
 * existed — indistinguishable from a step repeatedly skipped, and the exact
 * false-failure evidence the export is meant not to manufacture.
 *
 * Now: where the script of the day is known (item.steps_changed / item.created
 * cover it), steps that did not yet exist produce no row at all. Where it is
 * not known, the row survives but `done` is blank rather than false — a tick is
 * proof of doing, the absence of one is not proof of skipping when the step may
 * not have been there. `script_source` says which case a row is.
 */
function routineStepsCsv(input: BundleInput, ctx: Ctx): string {
  const L = lookups(input.db);
  const header = [
    "routine_id", "routine_title", "area_name", "day", "weekday", "step_id", "step_title",
    "position", "optional", "planned_minutes", "done", "script_source", ...timeHeaders("done"),
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
    const script = stepIdsAsOfDay(ctx.history, routine, note.date);
    routine.steps.forEach((step, position) => {
      const wasTicked = done.has(step.id);
      // known script, and this step was not part of it: it is not a step that
      // was missed, it is a step that did not exist. No row.
      if (script.known && script.value && !script.value.has(step.id) && !wasTicked) return;
      const tickedAt = at[step.id] ?? null;
      rows.push([
        routine.id, routine.title, L.areaName(routine), note.date, dayWeekday(note.date),
        step.id, step.title, position, !!step.optional, step.minutes ?? "",
        wasTicked ? true : script.known ? false : "",
        script.known ? "recorded" : "unknown",
        ...timeColumnsZoned2(ctx, tickedAt),
        tickedAt ? ticked.indexOf(step.id) + 1 : "",
        step.itemId ?? "", L.itemTitle(step.itemId), note.text,
      ]);
    });
  }
  return csvFile(header, rows);
}

/**
 * What was supposed to happen, one row per scheduled item per day.
 *
 * The counterpart to every other file here: they record what happened, and a
 * missed day is the absence of a row rather than a row of its own. Without this
 * the reader has to re-derive the app's five cadence rules — and apply them
 * against cadences that may have changed since — before "how often did I
 * actually do this" can even be asked. See lib/export/expectations.ts.
 */
function expectationsCsv(input: BundleInput, rows: ExpectationRow[]): string {
  const L = lookups(input.db);
  const header = [
    "item_id", "item_title", "item_kind", "area_name", "day", "weekday",
    "expectation", "cadence", "cadence_detail", "cadence_source",
    "quota_period", "quota_target",
    "daily_target", "target_source", "value_logged", "met",
  ];
  const out: CsvValue[][] = rows.map((r) => {
    const item = L.itemById.get(r.itemId) ?? null;
    return [
      r.itemId, item?.title ?? "(deleted item)", item?.kind ?? "", L.areaName(item),
      r.day, dayWeekday(r.day),
      r.expectation, r.cadence ?? "", r.cadenceDetail,
      r.cadenceKnown ? "recorded" : "unknown",
      r.quotaPeriod, r.quotaTarget ?? "",
      r.dailyTarget ?? "", r.targetKnown ? "recorded" : "unknown",
      r.valueLogged,
      r.met === null ? "" : r.met,
    ];
  });
  return csvFile(header, out);
}

function listEntriesCsv(input: BundleInput, ctx: Ctx): string {
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
        e.done, ...timeColumnsZoned2(ctx, e.pickedAt),
        e.pickedAt ? Math.max(0, daysBetween(toDay(new Date(e.pickedAt)), input.today)) : "",
      ]);
    });
  }
  return csvFile(header, rows);
}

function seedsCsv(input: BundleInput, ctx: Ctx): string {
  const L = lookups(input.db);
  const header = [
    "seed_id", "text", "status", ...timeHeaders("captured"), ...timeHeaders("archived"),
    "became_item_id", "became_item_title", "days_resting",
  ];
  const rows: CsvValue[][] = [...input.db.seeds]
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((s) => [
      s.id, s.text, s.status, ...timeColumnsZoned2(ctx, s.createdAt), ...timeColumnsZoned2(ctx, s.archivedAt),
      s.itemId ?? "", L.itemTitle(s.itemId),
      Math.max(0, daysBetween(toDay(new Date(s.createdAt)), toDay(new Date(s.archivedAt ?? Date.now())))),
    ]);
  return csvFile(header, rows);
}

function labelsCsv(input: BundleInput, ctx: Ctx): string {
  const header = ["label_id", "name", "emoji", "color", "position", "items_tagged", ...timeHeaders("created")];
  const rows: CsvValue[][] = [...input.db.labels]
    .sort((a, b) => a.position - b.position)
    .map((l) => [
      l.id, l.name, l.emoji, l.color, l.position,
      input.db.items.filter((i) => i.labels.includes(l.id)).length,
      ...timeColumnsZoned2(ctx, l.createdAt),
    ]);
  return csvFile(header, rows);
}

function dayOrderCsv(input: BundleInput, ctx: Ctx): string {
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
      rows.push([d.date, dayWeekday(d.date), position, entryId, kind, ...timeColumnsZoned2(ctx, d.updatedAt)]);
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

/* ————— human text, in tables —————
 *
 * The markdown files below stay exactly as they were: the words, verbatim,
 * meant to be read. These are the same rows in a shape a tool can join —
 * carrying the ids and the written/edited timestamps that the prose cannot,
 * because "when did I say this" is a different fact from "what did I say", and
 * an entry dated the 5th may have been written on the 26th.
 */

function journalCsv(input: BundleInput, ctx: Ctx): string {
  const header = [
    "entry_id", "day", "weekday", "mood", "energy", "sleep_hours", "sleep_quality",
    "stress", "focus_rating", "tags", "intention", "gratitude",
    "rough_notes_chars", "end_of_day_chars", "written_same_day",
    ...timeHeaders("first_written"), ...timeHeaders("last_updated"),
  ];
  const rows: CsvValue[][] = [...input.db.journal]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((j) => [
      j.id, j.date, dayWeekday(j.date), j.mood, j.energy, j.sleepHours ?? "", j.sleepQuality ?? "",
      j.stress ?? "", j.focus ?? "", (j.tags ?? []).join(" | "), j.intention ?? "", j.gratitude ?? "",
      j.roughNotes.length, j.endOfDay.length,
      // a day written up on the day, or reconstructed later: different evidence
      toDay(new Date(j.createdAt)) === j.date,
      ...timeColumnsZoned2(ctx, j.createdAt), ...timeColumnsZoned2(ctx, j.updatedAt),
    ]);
  return csvFile(header, rows);
}

function reflectionsCsv(input: BundleInput, ctx: Ctx): string {
  const header = [
    "reflection_id", "period", "period_key", "rating_overall", "rating_energy", "rating_progress",
    "text_chars", "win_count", "lesson_count", "blocker_count", "area_note_count",
    "intention_count", ...timeHeaders("first_written"), ...timeHeaders("last_updated"),
  ];
  const rows: CsvValue[][] = [...input.db.reflections]
    .sort((a, b) => (a.periodKey < b.periodKey ? -1 : a.periodKey > b.periodKey ? 1 : 0))
    .map((r) => [
      r.id, r.period, r.periodKey,
      r.ratings?.overall ?? "", r.ratings?.energy ?? "", r.ratings?.progress ?? "",
      r.text.length, r.wins?.length ?? 0, r.lessons?.length ?? 0, r.blockers?.length ?? 0,
      r.areaNotes ? Object.keys(r.areaNotes).length : 0, r.intentions?.length ?? 0,
      ...timeColumnsZoned2(ctx, r.createdAt), ...timeColumnsZoned2(ctx, r.updatedAt),
    ]);
  return csvFile(header, rows);
}

/** Notes had no id anywhere readable, so a note could not be joined to its own
 *  events, its folder or anything happening around it. */
function notesCsv(input: BundleInput, ctx: Ctx): string {
  const L = lookups(input.db);
  const folderPath = (item: Item): string => {
    const parts: string[] = [];
    let cur = item.parentId ? L.itemById.get(item.parentId) : undefined;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      parts.unshift(cur.title);
      cur = cur.parentId ? L.itemById.get(cur.parentId) : undefined;
    }
    return parts.join(" / ");
  };
  const header = [
    "item_id", "title", "kind", "folder_path", "parent_id", "area_name", "labels",
    "body_chars", "annotation_chars", "in_trash", ...timeHeaders("created"), ...timeHeaders("deleted"),
  ];
  const rows: CsvValue[][] = input.db.items
    .filter((i) => i.kind === "note" || i.kind === "folder")
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((n) => [
      n.id, n.title, n.kind, folderPath(n), n.parentId ?? "", L.areaName(n), L.labelNames(n.labels),
      n.richBody?.length ?? 0, n.note.length, !!n.deletedAt,
      ...timeColumnsZoned2(ctx, n.createdAt), ...timeColumnsZoned2(ctx, n.deletedAt),
    ]);
  return csvFile(header, rows);
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
    // when it was actually written, which is not always the day it is about —
    // a day written up that evening and one reconstructed three weeks later
    // are different evidence, and the date alone could never tell them apart
    const writtenDay = toDay(new Date(j.createdAt));
    const editedDay = toDay(new Date(j.updatedAt));
    out.push(
      `<!-- entry_id: ${j.id} -->`,
      writtenDay === j.date && editedDay === j.date
        ? `_written on the day_`
        : `_written ${writtenDay}${editedDay !== writtenDay ? `, last edited ${editedDay}` : ""}_`,
      ""
    );
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
    const written = toDay(new Date(r.createdAt));
    const edited = toDay(new Date(r.updatedAt));
    out.push(
      `<!-- reflection_id: ${r.id} -->`,
      `_written ${written}${edited !== written ? `, last edited ${edited}` : ""}_`,
      ""
    );
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
  // trashed notes are included, and marked. Leaving them out put their whole
  // body in raw.json and nowhere a person would read — a note deleted last
  // month is still something the writer thought.
  const notes = input.db.items
    .filter((i) => i.kind === "note" || i.kind === "folder")
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
    const parent = n.parentId ? L.itemTitle(n.parentId) : "";
    out.push(
      `<!-- item_id: ${n.id} -->`,
      `_${toDay(new Date(n.createdAt))}` +
        `${area ? ` · ${area}` : ""}` +
        `${parent ? ` · in ${parent}` : ""}` +
        `${n.labels.length ? ` · ${L.labelNames(n.labels)}` : ""}` +
        `${n.deletedAt ? ` · in trash since ${toDay(new Date(n.deletedAt))}` : ""}_`,
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
