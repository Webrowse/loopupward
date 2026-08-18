/**
 * Deterministic statistics over everything the app has recorded.
 *
 * Pure counting, start to finish. There is no model here, no inference, no
 * "insight" — every number below is arithmetic a reader could redo by hand
 * from the CSVs in the export, and the README says exactly how. That is the
 * point: the export is meant to be handed to whatever tool the user likes,
 * and a file that has already guessed at conclusions is worth less than one
 * that shows its working.
 *
 * lib/review.ts stays the source of truth for a *period's* review — this sits
 * beside it and answers the questions a period review never asked: when in
 * the day things actually happen, how long they really take against what was
 * planned, what gets rescheduled, and what gets abandoned.
 */

import { addDays, daysBetween, isoWeek, toDay } from "./dates";
import {
  AppEvent,
  DB,
  DEFAULT_WEEK_START,
  FocusSession,
  Item,
  Streams,
  UserSettings,
} from "./types";
import { areaOfItem, bestStreak, currentStreak, habitDailyTarget, habitDays } from "./progress";

export interface StatsRange {
  /** inclusive local day, YYYY-MM-DD */
  start: string;
  end: string;
}

export interface StatsInput {
  db: DB;
  streams: Streams;
  settings: UserSettings;
  /** omit for all time */
  range?: StatsRange;
  today: string;
}

/* ————— shapes ————— */

export interface CompletionScore {
  key: string;
  label: string;
  planned: number;
  completed: number;
  rate: number;
}

/** 24 buckets, one per local hour, and 7 by weekday (0 = Sunday). */
export interface TimeOfDay {
  byHour: number[];
  byWeekday: number[];
  total: number;
  /** the hour with the most, or null when nothing landed at all */
  peakHour: number | null;
}

export interface PlannedVsActual {
  key: string;
  label: string;
  sessions: number;
  plannedMinutes: number;
  actualMinutes: number;
  /** actual / planned. Above 1 means it takes longer than you think. Null
   *  when nothing was ever planned, which is a different fact from 1.0. */
  ratio: number | null;
}

export interface LeadTime {
  key: string;
  label: string;
  count: number;
  /** days from creation to the first action planned against it */
  medianToFirstAction: number | null;
  /** days from creation to completion */
  medianToCompletion: number | null;
}

export interface RescheduleRecord {
  actionId: string;
  title: string;
  itemId: string | null;
  itemTitle: string | null;
  times: number;
  /** total days pushed forward across every move */
  daysSlipped: number;
  firstPlanned: string | null;
  lastPlanned: string | null;
}

export interface AbandonmentStats {
  sessionsStarted: number;
  sessionsCompleted: number;
  sessionsAbandoned: number;
  sessionsExpired: number;
  sessionsSkipped: number;
  sessionsInterrupted: number;
  /** completed / started */
  completionRate: number | null;
  dayRunsStarted: number;
  dayRunsFinished: number;
  dayRunsAbandoned: number;
  /** on an abandoned day run, how many steps were done first — averaged */
  avgStepsBeforeAbandon: number | null;
}

export interface StreakRecord {
  itemId: string;
  title: string;
  kind: string;
  daysLogged: number;
  currentStreak: number;
  longestStreak: number;
  /** how many breaks fell on each weekday (0 = Sunday) — a habit that only
   *  ever dies on Saturdays is a schedule problem, not a willpower one */
  breaksByWeekday: number[];
  worstWeekday: string | null;
}

export interface IntroductionRate {
  /** ISO week key, e.g. 2026-W33 */
  week: string;
  created: number;
  completed: number;
  byKind: Record<string, number>;
}

export interface AgeBucket {
  label: string;
  count: number;
}

export interface StepReliability {
  routineId: string;
  routineTitle: string;
  stepId: string;
  stepTitle: string;
  position: number;
  optional: boolean;
  timesDone: number;
  timesSkipped: number;
  /** runs that ended without reaching a later step — where the routine dies */
  timesRunEndedHere: number;
  plannedMinutes: number | null;
  actualMinutesMedian: number | null;
}

/** One row per day, with everything paired up and nothing interpreted. The
 *  export emits these as daily.csv; whatever the reader wants to correlate,
 *  they can, and the app deliberately does not do it for them. */
export interface DailyRow {
  day: string;
  weekday: string;
  journalWritten: boolean;
  mood: number | null;
  energy: number | null;
  sleepHours: number | null;
  sleepQuality: number | null;
  stress: number | null;
  focusRating: number | null;
  hasGratitude: boolean;
  hasIntention: boolean;
  actionsPlanned: number;
  actionsCompleted: number;
  habitDaysLogged: number;
  routineDaysLogged: number;
  focusSessions: number;
  focusMinutesPlanned: number;
  focusMinutesActual: number;
  focusSessionsAbandoned: number;
  pauseCount: number;
  appOpens: number;
  firstOpenLocal: string | null;
  lastWriteLocal: string | null;
  distinctRoutes: number;
  events: number;
}

export interface LifeStats {
  range: StatsRange | null;
  generatedAt: number;
  /** Which weekday weeks begin on. Not a statistic, but a reader who does not
   *  know it cannot reproduce any weekly figure or read any week key. */
  weekStart: number;
  /** overall */
  actionsPlanned: number;
  actionsCompleted: number;
  completionRate: number | null;
  habitDaysLogged: number;
  daysCovered: number;

  byArea: CompletionScore[];
  byKind: CompletionScore[];
  byLabel: CompletionScore[];

  actionsCompletedByTime: TimeOfDay;
  habitsLoggedByTime: TimeOfDay;
  focusStartedByTime: TimeOfDay;
  routineStepsByTime: TimeOfDay;

  focusByItem: PlannedVsActual[];
  focusByRoutine: PlannedVsActual[];
  focusByStep: PlannedVsActual[];
  focusOverall: PlannedVsActual;

  leadTimeByKind: LeadTime[];
  leadTimeByArea: LeadTime[];

  reschedules: RescheduleRecord[];
  reschedulesByItem: { itemId: string; title: string; times: number; daysSlipped: number }[];
  totalReschedules: number;
  totalDaysSlipped: number;

  abandonment: AbandonmentStats;

  streaks: StreakRecord[];

  introductions: IntroductionRate[];
  itemsCreated: number;
  itemsCompleted: number;
  /** created / completed. Above 1 means the list is growing faster than it
   *  is being finished. Null when nothing was completed at all. */
  accumulationRatio: number | null;

  openItemAges: AgeBucket[];
  oldestUntouched: { itemId: string; title: string; kind: string; ageDays: number }[];

  stepReliability: StepReliability[];

  journalDaysWritten: number;
  journalCoverage: number | null;
  moodSeries: { day: string; mood: number | null; energy: number | null }[];

  daily: DailyRow[];
}

/* ————— small helpers ————— */

function inRange(day: string, range?: StatsRange): boolean {
  if (!range) return true;
  return day >= range.start && day <= range.end;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function emptyTimeOfDay(): TimeOfDay {
  return { byHour: new Array(24).fill(0), byWeekday: new Array(7).fill(0), total: 0, peakHour: null };
}

function addToTimeOfDay(t: TimeOfDay, at: number) {
  const d = new Date(at);
  t.byHour[d.getHours()] += 1;
  t.byWeekday[d.getDay()] += 1;
  t.total += 1;
}

function sealTimeOfDay(t: TimeOfDay): TimeOfDay {
  let peak: number | null = null;
  let best = 0;
  t.byHour.forEach((n, h) => {
    if (n > best) {
      best = n;
      peak = h;
    }
  });
  return { ...t, peakHour: peak };
}

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function score(planned: number, completed: number): number {
  return planned > 0 ? completed / planned : 0;
}

function plannedVsActual(key: string, label: string, rows: FocusSession[]): PlannedVsActual {
  const plannedMinutes = rows.reduce((sum, r) => sum + (r.plannedSeconds ?? 0) / 60, 0);
  const actualMinutes = rows.reduce((sum, r) => sum + r.actualSeconds / 60, 0);
  return {
    key,
    label,
    sessions: rows.length,
    plannedMinutes: round1(plannedMinutes),
    actualMinutes: round1(actualMinutes),
    ratio: plannedMinutes > 0 ? round2(actualMinutes / plannedMinutes) : null,
  };
}

/** A run holds the steps inside it, so its minutes are their minutes again.
 *  Every total is over the leaves; the containers get their own view. */
function isContainer(s: FocusSession): boolean {
  return s.kind === "routine_run" || s.kind === "day_run";
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Every day in the window, inclusive. Uncapped windows use the span the data
 *  actually covers, so an empty account produces an empty series rather than
 *  a decade of zeroes. */
function daysOf(range: StatsRange): string[] {
  const out: string[] = [];
  let d = range.start;
  // a guard, not a policy: fifty years of days is a corrupt range, not a life
  for (let i = 0; d <= range.end && i < 20_000; i++) {
    out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

/* ————— the computation ————— */

export function computeStats(input: StatsInput): LifeStats {
  const { db, streams, settings, range, today: todayStr } = input;
  const weekStart = settings.weekStart ?? DEFAULT_WEEK_START;

  const itemById = new Map(db.items.map((i) => [i.id, i]));
  const areaById = new Map(db.areas.map((a) => [a.id, a]));
  const labelById = new Map(db.labels.map((l) => [l.id, l]));

  const actions = db.actions.filter((a) => inRange(a.date, range));
  const logs = db.logs.filter((l) => inRange(l.date, range));
  const sessions = streams.focusSessions.filter((s) => inRange(s.day, range));
  const events = streams.events.filter((e) => inRange(e.day, range));
  const journal = db.journal.filter((j) => inRange(j.date, range));

  /* ——— overall and per-slice completion ——— */
  const actionsCompleted = actions.filter((a) => a.done).length;

  const areaBuckets = new Map<string, { planned: number; completed: number }>();
  const kindBuckets = new Map<string, { planned: number; completed: number }>();
  const labelBuckets = new Map<string, { planned: number; completed: number }>();
  const bump = (m: Map<string, { planned: number; completed: number }>, key: string, done: boolean) => {
    const rec = m.get(key) ?? { planned: 0, completed: 0 };
    rec.planned += 1;
    if (done) rec.completed += 1;
    m.set(key, rec);
  };

  for (const a of actions) {
    const item = a.itemId ? itemById.get(a.itemId) ?? null : null;
    bump(areaBuckets, areaOfItem(db, item) ?? "", a.done);
    bump(kindBuckets, item?.kind ?? "task", a.done);
    for (const labelId of item?.labels ?? []) bump(labelBuckets, labelId, a.done);
  }

  // a habit's days count toward its area and kind the same way a task does:
  // the day it was possible to do it is a commitment, kept or not
  const habitLike = db.items.filter(
    (i) => (i.kind === "habit" || i.kind === "routine") && i.status !== "archived"
  );
  const habitDaysLogged = habitLike.reduce((sum, h) => {
    const days = habitDays(logs, h.id, habitDailyTarget(h));
    return sum + days.size;
  }, 0);

  const byArea: CompletionScore[] = [...areaBuckets.entries()]
    .map(([key, r]) => ({
      key,
      label: key ? areaById.get(key)?.name ?? "(deleted area)" : "Unfiled",
      planned: r.planned,
      completed: r.completed,
      rate: score(r.planned, r.completed),
    }))
    .sort((a, b) => b.planned - a.planned);

  const byKind: CompletionScore[] = [...kindBuckets.entries()]
    .map(([key, r]) => ({ key, label: key, planned: r.planned, completed: r.completed, rate: score(r.planned, r.completed) }))
    .sort((a, b) => b.planned - a.planned);

  const byLabel: CompletionScore[] = [...labelBuckets.entries()]
    .map(([key, r]) => ({
      key,
      label: labelById.get(key)?.name ?? "(deleted label)",
      planned: r.planned,
      completed: r.completed,
      rate: score(r.planned, r.completed),
    }))
    .sort((a, b) => b.planned - a.planned);

  /* ——— when things actually happen ——— */
  const actionsCompletedByTime = emptyTimeOfDay();
  for (const a of actions) if (a.done && a.doneAt) addToTimeOfDay(actionsCompletedByTime, a.doneAt);

  const habitsLoggedByTime = emptyTimeOfDay();
  for (const l of logs) if (l.op === "add" && l.value > 0) addToTimeOfDay(habitsLoggedByTime, l.createdAt);

  const focusStartedByTime = emptyTimeOfDay();
  for (const s of sessions) {
    if (s.kind === "rest" || isContainer(s)) continue;
    // a routine run and its first step start in the same second, so counting
    // both would put a second bump on every morning
    addToTimeOfDay(focusStartedByTime, s.startedAt);
  }

  // step ticks carry their own timestamps now, which is the only way to know
  // what order a script was really walked in
  const routineStepsByTime = emptyTimeOfDay();
  for (const note of db.habitDayNotes) {
    if (!inRange(note.date, range)) continue;
    for (const at of Object.values(note.doneStepsAt ?? {})) addToTimeOfDay(routineStepsByTime, at);
  }

  /* ——— planned vs actual: the most interesting number in the export ———
   *
   * A run and the steps inside it are both real rows, and adding them
   * together would count the same hour twice. So every total below is over
   * the LEAF attempts — focus blocks and routine steps — and the whole-run
   * view is kept separately, in focusByRoutine.
   */
  const work = sessions.filter((s) => s.kind !== "rest");
  const leaf = work.filter((s) => !isContainer(s));
  const byItemSessions = new Map<string, FocusSession[]>();
  const byRoutineSessions = new Map<string, FocusSession[]>();
  const byStepSessions = new Map<string, FocusSession[]>();
  for (const s of leaf) {
    if (s.itemId) {
      byItemSessions.set(s.itemId, [...(byItemSessions.get(s.itemId) ?? []), s]);
    }
    if (s.kind === "routine_step" && s.stepId) {
      const key = `${s.itemId ?? ""}:${s.stepId}`;
      byStepSessions.set(key, [...(byStepSessions.get(key) ?? []), s]);
    }
  }
  for (const s of work) {
    if (s.kind === "routine_run" && s.itemId) {
      byRoutineSessions.set(s.itemId, [...(byRoutineSessions.get(s.itemId) ?? []), s]);
    }
  }

  const stepTitle = (itemId: string | null, stepId: string): string => {
    const routine = itemId ? itemById.get(itemId) : undefined;
    return routine?.steps?.find((st) => st.id === stepId)?.title ?? stepId;
  };

  const focusByItem = [...byItemSessions.entries()]
    .map(([id, rows]) => plannedVsActual(id, itemById.get(id)?.title ?? "(deleted item)", rows))
    .sort((a, b) => b.actualMinutes - a.actualMinutes);
  const focusByRoutine = [...byRoutineSessions.entries()]
    .map(([id, rows]) => plannedVsActual(id, itemById.get(id)?.title ?? "(deleted routine)", rows))
    .sort((a, b) => b.actualMinutes - a.actualMinutes);
  const focusByStep = [...byStepSessions.entries()]
    .map(([key, rows]) => {
      const [itemId, stepId] = key.split(":");
      return plannedVsActual(key, stepTitle(itemId || null, stepId), rows);
    })
    .sort((a, b) => b.actualMinutes - a.actualMinutes);
  const focusOverall = plannedVsActual("all", "All focused work", leaf);

  /* ——— lead times ——— */
  const firstActionFor = new Map<string, string>();
  for (const a of db.actions) {
    if (!a.itemId) continue;
    const prev = firstActionFor.get(a.itemId);
    if (!prev || a.date < prev) firstActionFor.set(a.itemId, a.date);
  }

  const leadTimes = (group: (i: Item) => string | null, label: (key: string) => string): LeadTime[] => {
    const buckets = new Map<string, { toAction: number[]; toDone: number[] }>();
    for (const item of db.items) {
      if (item.deletedAt) continue;
      const createdDay = toDay(new Date(item.createdAt));
      if (!inRange(createdDay, range)) continue;
      const key = group(item);
      if (key === null) continue;
      const rec = buckets.get(key) ?? { toAction: [], toDone: [] };
      const first = firstActionFor.get(item.id);
      if (first) rec.toAction.push(Math.max(0, daysBetween(createdDay, first)));
      if (item.completedAt) {
        rec.toDone.push(Math.max(0, daysBetween(createdDay, toDay(new Date(item.completedAt)))));
      }
      buckets.set(key, rec);
    }
    return [...buckets.entries()]
      .map(([key, r]) => ({
        key,
        label: label(key),
        count: Math.max(r.toAction.length, r.toDone.length),
        medianToFirstAction: median(r.toAction),
        medianToCompletion: median(r.toDone),
      }))
      .sort((a, b) => b.count - a.count);
  };

  const leadTimeByKind = leadTimes((i) => i.kind, (k) => k);
  const leadTimeByArea = leadTimes(
    (i) => areaOfItem(db, i) ?? "",
    (k) => (k ? areaById.get(k)?.name ?? "(deleted area)" : "Unfiled")
  );

  /* ——— procrastination, counted ——— */
  const rescheduleByAction = new Map<string, RescheduleRecord>();
  for (const e of events) {
    if (e.type !== "action.rescheduled") continue;
    const p = e.payload as { actionId?: string; title?: string; from?: string; to?: string; daysMoved?: number };
    if (!p.actionId) continue;
    const item = e.itemId ? itemById.get(e.itemId) : undefined;
    const rec = rescheduleByAction.get(p.actionId) ?? {
      actionId: p.actionId,
      title: p.title ?? db.actions.find((a) => a.id === p.actionId)?.title ?? "(deleted task)",
      itemId: e.itemId,
      itemTitle: item?.title ?? null,
      times: 0,
      daysSlipped: 0,
      firstPlanned: p.from ?? null,
      lastPlanned: p.to ?? null,
    };
    rec.times += 1;
    // only forward moves slip: pulling a task earlier is the opposite habit
    rec.daysSlipped += Math.max(0, p.daysMoved ?? 0);
    if (p.from && (!rec.firstPlanned || p.from < rec.firstPlanned)) rec.firstPlanned = p.from;
    if (p.to) rec.lastPlanned = p.to;
    rescheduleByAction.set(p.actionId, rec);
  }
  const reschedules = [...rescheduleByAction.values()].sort((a, b) => b.times - a.times);

  const perItem = new Map<string, { itemId: string; title: string; times: number; daysSlipped: number }>();
  for (const r of reschedules) {
    if (!r.itemId) continue;
    const rec = perItem.get(r.itemId) ?? {
      itemId: r.itemId,
      title: r.itemTitle ?? itemById.get(r.itemId)?.title ?? "(deleted item)",
      times: 0,
      daysSlipped: 0,
    };
    rec.times += r.times;
    rec.daysSlipped += r.daysSlipped;
    perItem.set(r.itemId, rec);
  }
  const reschedulesByItem = [...perItem.values()].sort((a, b) => b.times - a.times);

  /* ——— abandonment ——— */
  // leaf attempts again: a run's outcome is the day-run counters below, and
  // counting it here as well would say every routine was two attempts
  const counted = (outcome: string) => leaf.filter((s) => s.outcome === outcome).length;
  const dayRunsStarted = events.filter((e) => e.type === "day_run.started").length;
  const dayRunsFinished = events.filter((e) => e.type === "day_run.finished").length;
  const abandonedRuns = events.filter((e) => e.type === "day_run.abandoned");
  const stepsBefore = abandonedRuns
    .map((e) => (e.payload as { completedBefore?: number }).completedBefore)
    .filter((n): n is number => typeof n === "number");
  const abandonment: AbandonmentStats = {
    sessionsStarted: leaf.length,
    sessionsCompleted: counted("completed"),
    sessionsAbandoned: counted("abandoned"),
    sessionsExpired: counted("expired"),
    sessionsSkipped: counted("skipped"),
    sessionsInterrupted: counted("interrupted"),
    completionRate: leaf.length ? round2(counted("completed") / leaf.length) : null,
    dayRunsStarted,
    dayRunsFinished,
    dayRunsAbandoned: abandonedRuns.length,
    avgStepsBeforeAbandon: stepsBefore.length
      ? round1(stepsBefore.reduce((a, b) => a + b, 0) / stepsBefore.length)
      : null,
  };

  /* ——— streaks and where they break ——— */
  const streaks: StreakRecord[] = habitLike
    .map((h) => {
      const all = habitDays(db.logs, h.id, habitDailyTarget(h));
      const windowed = new Set([...all].filter((d) => inRange(d, range)));
      const breaks = new Array(7).fill(0);
      const sorted = [...windowed].sort();
      for (let i = 1; i < sorted.length; i++) {
        const gap = daysBetween(sorted[i - 1], sorted[i]);
        // every missed day between two logged ones is a break, and which
        // weekday it fell on is the part worth seeing
        for (let g = 1; g < gap; g++) {
          const missed = addDays(sorted[i - 1], g);
          breaks[new Date(`${missed}T12:00:00`).getDay()] += 1;
        }
      }
      let worst: string | null = null;
      let worstCount = 0;
      breaks.forEach((n: number, i: number) => {
        if (n > worstCount) {
          worstCount = n;
          worst = WEEKDAY_NAMES[i];
        }
      });
      return {
        itemId: h.id,
        title: h.title,
        kind: h.kind,
        daysLogged: windowed.size,
        currentStreak: currentStreak(all, todayStr),
        longestStreak: bestStreak(all),
        breaksByWeekday: breaks,
        worstWeekday: worst,
      };
    })
    .filter((s) => s.daysLogged > 0 || s.longestStreak > 0)
    .sort((a, b) => b.daysLogged - a.daysLogged);

  /* ——— are things arriving faster than they leave? ——— */
  const weeks = new Map<string, IntroductionRate>();
  const weekKeyOf = (day: string) => {
    const { year, week } = isoWeek(day);
    return `${year}-W${String(week).padStart(2, "0")}`;
  };
  const weekRec = (day: string) => {
    const key = weekKeyOf(day);
    const rec = weeks.get(key) ?? { week: key, created: 0, completed: 0, byKind: {} };
    weeks.set(key, rec);
    return rec;
  };
  let itemsCreated = 0;
  let itemsCompleted = 0;
  for (const item of db.items) {
    const createdDay = toDay(new Date(item.createdAt));
    if (inRange(createdDay, range)) {
      const rec = weekRec(createdDay);
      rec.created += 1;
      rec.byKind[item.kind] = (rec.byKind[item.kind] ?? 0) + 1;
      itemsCreated += 1;
    }
    if (item.completedAt) {
      const doneDay = toDay(new Date(item.completedAt));
      if (inRange(doneDay, range)) {
        weekRec(doneDay).completed += 1;
        itemsCompleted += 1;
      }
    }
  }
  const introductions = [...weeks.values()].sort((a, b) => (a.week < b.week ? -1 : 1));

  /* ——— what is sitting open, and for how long ——— */
  const AGE_BUCKETS: { label: string; max: number }[] = [
    { label: "0–7 days", max: 7 },
    { label: "8–30 days", max: 30 },
    { label: "31–90 days", max: 90 },
    { label: "91–365 days", max: 365 },
    { label: "over a year", max: Infinity },
  ];
  const openItems = db.items.filter((i) => !i.deletedAt && i.status === "active");
  const openItemAges: AgeBucket[] = AGE_BUCKETS.map((b) => ({ label: b.label, count: 0 }));
  const touched = new Set<string>([
    ...db.actions.map((a) => a.itemId).filter((id): id is string => !!id),
    ...db.logs.map((l) => l.itemId),
  ]);
  const untouched: { itemId: string; title: string; kind: string; ageDays: number }[] = [];
  for (const item of openItems) {
    const ageDays = Math.max(0, daysBetween(toDay(new Date(item.createdAt)), todayStr));
    const idx = AGE_BUCKETS.findIndex((b) => ageDays <= b.max);
    openItemAges[idx === -1 ? AGE_BUCKETS.length - 1 : idx].count += 1;
    if (!touched.has(item.id)) {
      untouched.push({ itemId: item.id, title: item.title, kind: item.kind, ageDays });
    }
  }
  const oldestUntouched = untouched.sort((a, b) => b.ageDays - a.ageDays).slice(0, 25);

  /* ——— which step a routine dies on ——— */
  const skipCounts = new Map<string, number>();
  for (const e of events) {
    if (e.type !== "routine.step_skipped") continue;
    const p = e.payload as { stepId?: string };
    if (!p.stepId) continue;
    const key = `${e.itemId ?? ""}:${p.stepId}`;
    skipCounts.set(key, (skipCounts.get(key) ?? 0) + 1);
  }
  const doneCounts = new Map<string, number>();
  const endedHere = new Map<string, number>();
  for (const note of db.habitDayNotes) {
    if (!inRange(note.date, range)) continue;
    const routine = itemById.get(note.itemId);
    if (!routine?.steps?.length) continue;
    const done = new Set(note.doneSteps ?? []);
    for (const st of routine.steps) {
      const key = `${routine.id}:${st.id}`;
      if (done.has(st.id)) doneCounts.set(key, (doneCounts.get(key) ?? 0) + 1);
    }
    // the last step ticked on a day the script was not finished is where that
    // day's run stopped
    if (done.size > 0 && done.size < routine.steps.length) {
      const lastDone = [...routine.steps].reverse().find((st) => done.has(st.id));
      if (lastDone) {
        const key = `${routine.id}:${lastDone.id}`;
        endedHere.set(key, (endedHere.get(key) ?? 0) + 1);
      }
    }
  }
  const stepReliability: StepReliability[] = [];
  for (const routine of db.items) {
    if (routine.kind !== "routine" || !routine.steps?.length) continue;
    routine.steps.forEach((st, position) => {
      const key = `${routine.id}:${st.id}`;
      const rows = byStepSessions.get(key) ?? [];
      stepReliability.push({
        routineId: routine.id,
        routineTitle: routine.title,
        stepId: st.id,
        stepTitle: st.title,
        position,
        optional: !!st.optional,
        timesDone: doneCounts.get(key) ?? 0,
        timesSkipped: skipCounts.get(key) ?? 0,
        timesRunEndedHere: endedHere.get(key) ?? 0,
        plannedMinutes: st.minutes ?? null,
        actualMinutesMedian: median(rows.map((r) => round1(r.actualSeconds / 60))),
      });
    });
  }
  stepReliability.sort((a, b) => b.timesSkipped - a.timesSkipped || b.timesRunEndedHere - a.timesRunEndedHere);

  /* ——— the day-by-day table ——— */
  const span: StatsRange | null = range ?? spanOf(db, streams);
  const days = span ? daysOf(span) : [];
  const journalByDay = new Map(journal.map((j) => [j.date, j]));
  const actionsByDay = new Map<string, { planned: number; done: number }>();
  for (const a of actions) {
    const rec = actionsByDay.get(a.date) ?? { planned: 0, done: 0 };
    rec.planned += 1;
    if (a.done) rec.done += 1;
    actionsByDay.set(a.date, rec);
  }
  const habitLogDays = new Map<string, Set<string>>();
  const routineLogDays = new Map<string, Set<string>>();
  for (const h of habitLike) {
    const target = habitDailyTarget(h);
    for (const day of habitDays(logs, h.id, target)) {
      const map = h.kind === "routine" ? routineLogDays : habitLogDays;
      const set = map.get(day) ?? new Set<string>();
      set.add(h.id);
      map.set(day, set);
    }
  }
  const sessionsByDay = new Map<string, FocusSession[]>();
  for (const s of leaf) sessionsByDay.set(s.day, [...(sessionsByDay.get(s.day) ?? []), s]);
  const eventsByDay = new Map<string, AppEvent[]>();
  for (const e of events) eventsByDay.set(e.day, [...(eventsByDay.get(e.day) ?? []), e]);

  const daily: DailyRow[] = days.map((day) => {
    const j = journalByDay.get(day);
    const acts = actionsByDay.get(day) ?? { planned: 0, done: 0 };
    const rows = sessionsByDay.get(day) ?? [];
    const dayEvents = eventsByDay.get(day) ?? [];
    const opens = dayEvents.filter((e) => e.type === "app.opened");
    const firstOpen = opens.length ? Math.min(...opens.map((e) => e.at)) : null;
    const writes = dayEvents.filter((e) => e.type !== "page.viewed" && e.type !== "app.opened");
    const lastWrite = writes.length ? Math.max(...writes.map((e) => e.at)) : null;
    const routes = new Set(
      dayEvents
        .filter((e) => e.type === "page.viewed")
        .map((e) => String((e.payload as { route?: string }).route ?? ""))
    );
    return {
      day,
      weekday: WEEKDAY_NAMES[new Date(`${day}T12:00:00`).getDay()],
      journalWritten: !!(j && (j.roughNotes.trim() || j.endOfDay.trim())),
      mood: j?.mood ?? null,
      energy: j?.energy ?? null,
      sleepHours: j?.sleepHours ?? null,
      sleepQuality: j?.sleepQuality ?? null,
      stress: j?.stress ?? null,
      focusRating: j?.focus ?? null,
      hasGratitude: !!j?.gratitude?.trim(),
      hasIntention: !!j?.intention?.trim(),
      actionsPlanned: acts.planned,
      actionsCompleted: acts.done,
      habitDaysLogged: habitLogDays.get(day)?.size ?? 0,
      routineDaysLogged: routineLogDays.get(day)?.size ?? 0,
      focusSessions: rows.length,
      focusMinutesPlanned: round1(rows.reduce((sum, r) => sum + (r.plannedSeconds ?? 0) / 60, 0)),
      focusMinutesActual: round1(rows.reduce((sum, r) => sum + r.actualSeconds / 60, 0)),
      focusSessionsAbandoned: rows.filter((r) => r.outcome === "abandoned").length,
      pauseCount: rows.reduce((sum, r) => sum + r.pauseCount, 0),
      appOpens: opens.length,
      firstOpenLocal: firstOpen ? hhmm(firstOpen) : null,
      lastWriteLocal: lastWrite ? hhmm(lastWrite) : null,
      distinctRoutes: routes.size,
      events: dayEvents.length,
    };
  });

  const journalDaysWritten = daily.filter((d) => d.journalWritten).length;

  return {
    range: span,
    generatedAt: Date.now(),
    actionsPlanned: actions.length,
    actionsCompleted,
    completionRate: actions.length ? round2(actionsCompleted / actions.length) : null,
    habitDaysLogged,
    daysCovered: days.length,
    byArea,
    byKind,
    byLabel,
    actionsCompletedByTime: sealTimeOfDay(actionsCompletedByTime),
    habitsLoggedByTime: sealTimeOfDay(habitsLoggedByTime),
    focusStartedByTime: sealTimeOfDay(focusStartedByTime),
    routineStepsByTime: sealTimeOfDay(routineStepsByTime),
    focusByItem,
    focusByRoutine,
    focusByStep,
    focusOverall,
    leadTimeByKind,
    leadTimeByArea,
    reschedules,
    reschedulesByItem,
    totalReschedules: reschedules.reduce((sum, r) => sum + r.times, 0),
    totalDaysSlipped: reschedules.reduce((sum, r) => sum + r.daysSlipped, 0),
    abandonment,
    streaks,
    introductions,
    itemsCreated,
    itemsCompleted,
    accumulationRatio: itemsCompleted > 0 ? round2(itemsCreated / itemsCompleted) : null,
    openItemAges,
    oldestUntouched,
    stepReliability,
    journalDaysWritten,
    journalCoverage: days.length ? round2(journalDaysWritten / days.length) : null,
    moodSeries: daily.map((d) => ({ day: d.day, mood: d.mood, energy: d.energy })),
    daily,
    weekStart,
  };
}

function hhmm(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** The window the account's own data actually covers, used when no range is
 *  asked for. First recorded day to today, so an all-time summary is not one
 *  long stretch of zeroes before the account existed. */
export function spanOf(db: DB, streams: Streams): StatsRange | null {
  const days: string[] = [
    ...db.actions.map((a) => a.date),
    ...db.logs.map((l) => l.date),
    ...db.journal.map((j) => j.date),
    ...db.habitDayNotes.map((n) => n.date),
    ...db.items.map((i) => toDay(new Date(i.createdAt))),
    ...streams.focusSessions.map((s) => s.day),
    ...streams.events.map((e) => e.day),
  ].filter(Boolean);
  if (days.length === 0) return null;
  let start = days[0];
  let end = days[0];
  for (const d of days) {
    if (d < start) start = d;
    if (d > end) end = d;
  }
  const todayStr = toDay(new Date());
  return { start, end: end > todayStr ? end : todayStr };
}
