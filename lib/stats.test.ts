import { describe, expect, it } from "vitest";
import { computeStats, StatsInput } from "@/lib/stats";
import {
  Action,
  AppEvent,
  DB,
  EMPTY_DB,
  EMPTY_SETTINGS,
  EMPTY_STREAMS,
  FocusSession,
  Item,
  Log,
  Streams,
} from "@/lib/types";

/* ————— fixtures ————— */

function item(over: Partial<Item> = {}): Item {
  return {
    id: "i1", areaId: null, parentId: null, kind: "goal", tracker: "none",
    title: "A goal", note: "", target: null, current: 0, unit: null, horizon: null,
    horizonPeriod: null, dateRepeatsYearly: false, richBody: null, status: "active",
    cadence: null, cadenceDays: null, cadenceCount: null, steps: null, entries: null,
    windowStart: null, windowEnd: null, pulledToday: false, labels: [], pinned: false,
    position: 0, createdAt: Date.parse("2026-08-01T09:00:00"), completedAt: null, deletedAt: null,
    ...over,
  };
}

function action(over: Partial<Action> = {}): Action {
  return {
    id: "a1", itemId: null, title: "Do the thing", date: "2026-08-17", done: false,
    doneAt: null, amount: 1, priority: 0, note: "", createdAt: Date.parse("2026-08-17T08:00:00"),
    ...over,
  };
}

function session(over: Partial<FocusSession> = {}): FocusSession {
  const startedAt = Date.parse("2026-08-17T09:00:00");
  return {
    id: "s1", itemId: null, entryId: "e1", day: "2026-08-17", kind: "focus", stepId: null,
    startedAt, endedAt: startedAt + 25 * 60_000, plannedSeconds: 1500, actualSeconds: 1500,
    pausedSeconds: 0, pauseCount: 0, outcome: "completed",
    tz: "Asia/Kolkata", utcOffsetMinutes: 330, createdAt: startedAt,
    ...over,
  };
}

function event(type: AppEvent["type"], over: Partial<AppEvent> = {}): AppEvent {
  const at = Date.parse("2026-08-17T10:00:00");
  return {
    id: `ev-${type}-${Math.random()}`, at, day: "2026-08-17", tz: "Asia/Kolkata",
    utcOffsetMinutes: 330, type, itemId: null, payload: {}, createdAt: at,
    ...over,
  };
}

function stats(db: Partial<DB> = {}, streams: Partial<Streams> = {}, over: Partial<StatsInput> = {}) {
  return computeStats({
    db: { ...structuredClone(EMPTY_DB), ...db },
    streams: { ...structuredClone(EMPTY_STREAMS), ...streams },
    settings: { ...EMPTY_SETTINGS },
    today: "2026-08-18",
    ...over,
  });
}

/* ————— planned vs actual ————— */

describe("planned versus actual focus time", () => {
  it("reports the ratio that says how much longer things really take", () => {
    const s = stats({}, {
      focusSessions: [
        session({ id: "s1", plannedSeconds: 600, actualSeconds: 900 }),
        session({ id: "s2", plannedSeconds: 600, actualSeconds: 900 }),
      ],
    });
    expect(s.focusOverall.plannedMinutes).toBe(20);
    expect(s.focusOverall.actualMinutes).toBe(30);
    expect(s.focusOverall.ratio).toBe(1.5);
  });

  it("leaves the ratio null when nothing was ever planned, rather than calling it 1", () => {
    // an untimed session counted up; "no plan" and "matched the plan exactly"
    // are different facts and must not collapse into the same number
    const s = stats({}, { focusSessions: [session({ plannedSeconds: null, actualSeconds: 900 })] });
    expect(s.focusOverall.ratio).toBeNull();
    expect(s.focusOverall.actualMinutes).toBe(15);
  });

  it("keeps rest breaks out of focused-work totals", () => {
    const s = stats({}, {
      focusSessions: [
        session({ id: "s1", kind: "focus", plannedSeconds: 600, actualSeconds: 600 }),
        session({ id: "s2", kind: "rest", plannedSeconds: 300, actualSeconds: 300 }),
      ],
    });
    expect(s.focusOverall.sessions).toBe(1);
    expect(s.focusOverall.actualMinutes).toBe(10);
  });
});

/* ————— abandonment ————— */

describe("abandonment", () => {
  it("counts every outcome, not just the happy one", () => {
    const s = stats({}, {
      focusSessions: [
        session({ id: "s1", outcome: "completed" }),
        session({ id: "s2", outcome: "abandoned" }),
        session({ id: "s3", outcome: "expired" }),
        session({ id: "s4", outcome: "skipped" }),
      ],
    });
    const a = s.abandonment;
    expect(a.sessionsStarted).toBe(4);
    expect(a.sessionsCompleted).toBe(1);
    expect(a.sessionsAbandoned).toBe(1);
    expect(a.sessionsExpired).toBe(1);
    expect(a.sessionsSkipped).toBe(1);
    expect(a.completionRate).toBe(0.25);
  });

  it("records how far an abandoned day run got before it stopped", () => {
    const s = stats({}, {
      events: [
        event("day_run.started", { payload: { stepCount: 5 } }),
        event("day_run.abandoned", { payload: { stepCount: 5, completedBefore: 2 } }),
        event("day_run.started", { payload: { stepCount: 4 } }),
        event("day_run.abandoned", { payload: { stepCount: 4, completedBefore: 4 } }),
      ],
    });
    expect(s.abandonment.dayRunsStarted).toBe(2);
    expect(s.abandonment.dayRunsAbandoned).toBe(2);
    expect(s.abandonment.avgStepsBeforeAbandon).toBe(3);
  });
});

/* ————— procrastination ————— */

describe("reschedules", () => {
  it("counts moves and totals only the days actually slipped forward", () => {
    const s = stats({}, {
      events: [
        event("action.rescheduled", {
          itemId: "i1",
          payload: { actionId: "a1", title: "Write the report", from: "2026-08-10", to: "2026-08-12", daysMoved: 2 },
        }),
        event("action.rescheduled", {
          itemId: "i1",
          payload: { actionId: "a1", title: "Write the report", from: "2026-08-12", to: "2026-08-17", daysMoved: 5 },
        }),
        // pulled earlier — the opposite habit, and it must not offset the slip
        event("action.rescheduled", {
          itemId: "i1",
          payload: { actionId: "a1", title: "Write the report", from: "2026-08-17", to: "2026-08-16", daysMoved: -1 },
        }),
      ],
    });
    expect(s.totalReschedules).toBe(3);
    expect(s.totalDaysSlipped).toBe(7);
    expect(s.reschedules[0].title).toBe("Write the report");
    expect(s.reschedules[0].firstPlanned).toBe("2026-08-10");
    expect(s.reschedules[0].lastPlanned).toBe("2026-08-16");
  });
});

/* ————— time of day ————— */

describe("time-of-day histograms", () => {
  it("buckets completions by local hour and weekday", () => {
    const s = stats({
      actions: [
        action({ id: "a1", done: true, doneAt: Date.parse("2026-08-17T22:15:00") }),
        action({ id: "a2", done: true, doneAt: Date.parse("2026-08-17T22:45:00") }),
        action({ id: "a3", done: true, doneAt: Date.parse("2026-08-17T06:00:00") }),
      ],
    });
    expect(s.actionsCompletedByTime.byHour[22]).toBe(2);
    expect(s.actionsCompletedByTime.byHour[6]).toBe(1);
    expect(s.actionsCompletedByTime.peakHour).toBe(22);
    // 2026-08-17 is a Monday
    expect(s.actionsCompletedByTime.byWeekday[1]).toBe(3);
  });

  it("reads routine step ticks from their own timestamps", () => {
    const s = stats({
      items: [item({ id: "r1", kind: "routine", steps: [{ id: "s1", title: "Tidy", minutes: 5 }] })],
      habitDayNotes: [
        {
          id: "n1", itemId: "r1", date: "2026-08-17", text: "",
          doneSteps: ["s1"], doneStepsAt: { s1: Date.parse("2026-08-17T05:30:00") },
          createdAt: 0, updatedAt: 0,
        },
      ],
    });
    expect(s.routineStepsByTime.byHour[5]).toBe(1);
  });
});

/* ————— accumulation ————— */

describe("are things arriving faster than they leave", () => {
  it("counts creations and completions per week and gives the ratio", () => {
    const s = stats({
      items: [
        item({ id: "i1", createdAt: Date.parse("2026-08-10T09:00:00") }),
        item({ id: "i2", createdAt: Date.parse("2026-08-11T09:00:00") }),
        item({ id: "i3", createdAt: Date.parse("2026-08-12T09:00:00"), completedAt: Date.parse("2026-08-13T09:00:00") }),
      ],
    });
    expect(s.itemsCreated).toBe(3);
    expect(s.itemsCompleted).toBe(1);
    expect(s.accumulationRatio).toBe(3);
  });

  it("says nothing rather than dividing by zero when nothing is finished", () => {
    const s = stats({ items: [item({ id: "i1" })] });
    expect(s.accumulationRatio).toBeNull();
  });
});

/* ————— streaks ————— */

describe("streaks and where they break", () => {
  const habit = item({ id: "h1", kind: "habit", tracker: "habit", title: "Pushups", cadence: "daily" });
  const log = (date: string): Log => ({
    id: `l-${date}`, itemId: "h1", date, op: "add", value: 1,
    createdAt: Date.parse(`${date}T07:00:00`),
  });

  it("names the weekday a habit keeps dying on", () => {
    // logged every day of two weeks except both Saturdays
    const days = [
      "2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07", "2026-08-09",
      "2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14", "2026-08-16",
    ];
    const s = stats({ items: [habit], logs: days.map(log) });
    const rec = s.streaks.find((x) => x.itemId === "h1")!;
    expect(rec.daysLogged).toBe(12);
    expect(rec.worstWeekday).toBe("Saturday");
    expect(rec.breaksByWeekday[6]).toBe(2);
    // Aug 9–14 is the longer of the two runs, at six days
    expect(rec.longestStreak).toBe(6);
  });
});

/* ————— the daily table ————— */

describe("daily rows", () => {
  it("pairs the day's numbers without interpreting them", () => {
    const s = stats(
      {
        journal: [
          {
            id: "j1", date: "2026-08-17", roughNotes: "a good day", endOfDay: "",
            mood: 4, energy: 3, sleepHours: 7.5, sleepQuality: 4, stress: 2, focus: 4,
            gratitude: "coffee", intention: "", tags: [],
            createdAt: 0, updatedAt: 0,
          },
        ],
        actions: [
          action({ id: "a1", date: "2026-08-17", done: true, doneAt: Date.parse("2026-08-17T18:00:00") }),
          action({ id: "a2", date: "2026-08-17", done: false }),
        ],
      },
      {
        focusSessions: [session({ day: "2026-08-17", plannedSeconds: 1500, actualSeconds: 1800 })],
        events: [
          event("app.opened", { day: "2026-08-17", at: Date.parse("2026-08-17T07:05:00") }),
          event("page.viewed", { day: "2026-08-17", payload: { route: "/today" } }),
          event("page.viewed", { day: "2026-08-17", payload: { route: "/life" } }),
        ],
      },
      { range: { start: "2026-08-17", end: "2026-08-17" } }
    );
    const row = s.daily[0];
    expect(row.day).toBe("2026-08-17");
    expect(row.weekday).toBe("Monday");
    expect(row.journalWritten).toBe(true);
    expect(row.mood).toBe(4);
    expect(row.sleepHours).toBe(7.5);
    expect(row.hasGratitude).toBe(true);
    expect(row.hasIntention).toBe(false);
    expect(row.actionsPlanned).toBe(2);
    expect(row.actionsCompleted).toBe(1);
    expect(row.focusMinutesPlanned).toBe(25);
    expect(row.focusMinutesActual).toBe(30);
    expect(row.appOpens).toBe(1);
    expect(row.firstOpenLocal).toBe("07:05");
    expect(row.distinctRoutes).toBe(2);
  });

  it("leaves unrated days blank instead of zero", () => {
    const s = stats({}, {}, { range: { start: "2026-08-17", end: "2026-08-17" } });
    expect(s.daily[0].mood).toBeNull();
    expect(s.daily[0].journalWritten).toBe(false);
  });
});

/* ————— open work ————— */

describe("what is sitting open", () => {
  it("finds items nothing was ever planned or logged against", () => {
    const s = stats({
      items: [
        item({ id: "i1", title: "Untouched", createdAt: Date.parse("2026-01-01T09:00:00") }),
        item({ id: "i2", title: "Worked on", createdAt: Date.parse("2026-08-01T09:00:00") }),
      ],
      actions: [action({ id: "a1", itemId: "i2" })],
    });
    expect(s.oldestUntouched.map((i) => i.title)).toEqual(["Untouched"]);
    expect(s.oldestUntouched[0].ageDays).toBeGreaterThan(200);
  });
});
