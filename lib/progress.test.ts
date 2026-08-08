import { describe, expect, it } from "vitest";
import {
  bestStreak,
  currentStreak,
  effectiveCadence,
  habitDays,
  inRoutineWindow,
  linkableItems,
  linkIsStale,
  pickedEntries,
  routineLogDay,
  routineMinutes,
  routinesLinkedTo,
  tryingFor,
  weekLoggedDays,
} from "@/lib/progress";
import { Item, ListEntry, Log } from "@/lib/types";

/* ————— fixtures ————— */

function item(over: Partial<Item> = {}): Item {
  return {
    id: "i1", areaId: null, parentId: null, kind: "habit", tracker: "habit",
    title: "Test", note: "", target: null, current: 0, unit: null, horizon: null,
    horizonPeriod: null, dateRepeatsYearly: false, richBody: null, status: "active",
    cadence: null, cadenceDays: null, cadenceCount: null, steps: null, entries: null,
    windowStart: null, windowEnd: null, pulledToday: false, labels: [], pinned: false,
    position: 0, createdAt: 0, completedAt: null, deletedAt: null,
    ...over,
  };
}

function log(date: string, value = 1, itemId = "i1"): Log {
  return { id: `l-${date}-${value}`, itemId, date, op: "add", value, createdAt: 0 };
}

function entry(over: Partial<ListEntry> = {}): ListEntry {
  return { id: "e1", text: "thing", amount: null, unit: null, done: false, pickedAt: null, ...over };
}

/** A local Date, since every rule below is about the user's own clock. */
const at = (iso: string) => new Date(iso);

/* ————— which day a routine's work belongs to ————— */

describe("routineLogDay", () => {
  const night = item({ kind: "routine", windowStart: "21:00", windowEnd: "02:00" });
  const morning = item({ kind: "routine", windowStart: "06:00", windowEnd: "12:00" });

  it("keeps an ordinary routine on the calendar day", () => {
    expect(routineLogDay(morning, at("2026-08-05T07:30:00"))).toBe("2026-08-05");
    expect(routineLogDay(morning, at("2026-08-05T23:30:00"))).toBe("2026-08-05");
  });

  it("gives a wrapped window's late evening to that same evening", () => {
    expect(routineLogDay(night, at("2026-08-05T22:30:00"))).toBe("2026-08-05");
  });

  it("gives the small hours back to the evening they belong to", () => {
    // 1am Thursday is still Wednesday night as far as the human is concerned
    expect(routineLogDay(night, at("2026-08-06T01:00:00"))).toBe("2026-08-05");
  });

  it("keeps spilling until 4am even when the window closed at 2am", () => {
    expect(routineLogDay(night, at("2026-08-06T03:30:00"))).toBe("2026-08-05");
  });

  it("has moved on by breakfast", () => {
    expect(routineLogDay(night, at("2026-08-06T08:00:00"))).toBe("2026-08-06");
  });

  it("leaves a routine with no window alone", () => {
    expect(routineLogDay(item({ kind: "routine" }), at("2026-08-06T01:00:00"))).toBe("2026-08-06");
  });
});

describe("inRoutineWindow", () => {
  const night = item({ kind: "routine", windowStart: "21:00", windowEnd: "02:00" });

  it("is visible on both sides of midnight for a wrapped window", () => {
    expect(inRoutineWindow(night, at("2026-08-05T22:00:00"))).toBe(true);
    expect(inRoutineWindow(night, at("2026-08-06T01:00:00"))).toBe(true);
  });

  it("is hidden in the middle of the day", () => {
    expect(inRoutineWindow(night, at("2026-08-05T14:00:00"))).toBe(false);
  });

  it("treats a missing or half-set window as always visible", () => {
    expect(inRoutineWindow(item({ kind: "routine" }), at("2026-08-05T14:00:00"))).toBe(true);
    expect(
      inRoutineWindow(item({ kind: "routine", windowStart: "09:00" }), at("2026-08-05T03:00:00"))
    ).toBe(true);
  });

  it("is exclusive of its end and inclusive of its start", () => {
    const day = item({ kind: "routine", windowStart: "09:00", windowEnd: "17:00" });
    expect(inRoutineWindow(day, at("2026-08-05T09:00:00"))).toBe(true);
    expect(inRoutineWindow(day, at("2026-08-05T17:00:00"))).toBe(false);
  });
});

/* ————— streaks ————— */

describe("currentStreak", () => {
  it("counts back from the anchor", () => {
    const days = new Set(["2026-08-03", "2026-08-04", "2026-08-05"]);
    expect(currentStreak(days, "2026-08-05")).toBe(3);
  });

  it("survives today not being logged yet", () => {
    const days = new Set(["2026-08-03", "2026-08-04"]);
    expect(currentStreak(days, "2026-08-05")).toBe(2);
  });

  it("breaks on a two-day gap", () => {
    const days = new Set(["2026-08-01", "2026-08-04", "2026-08-05"]);
    expect(currentStreak(days, "2026-08-05")).toBe(2);
  });

  it("is zero when nothing recent was logged", () => {
    expect(currentStreak(new Set(["2026-07-01"]), "2026-08-05")).toBe(0);
  });

  it("counts across a month boundary", () => {
    const days = new Set(["2026-07-30", "2026-07-31", "2026-08-01"]);
    expect(currentStreak(days, "2026-08-01")).toBe(3);
  });
});

describe("bestStreak", () => {
  it("finds the longest run, not the latest", () => {
    const days = new Set([
      "2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04", // four
      "2026-08-10", "2026-08-11", // two
    ]);
    expect(bestStreak(days)).toBe(4);
  });

  it("is zero for no days and one for a single day", () => {
    expect(bestStreak(new Set())).toBe(0);
    expect(bestStreak(new Set(["2026-08-01"]))).toBe(1);
  });
});

/* ————— habit logging ————— */

describe("habitDays", () => {
  it("needs the daily target met, not merely touched", () => {
    const logs = [log("2026-08-01", 1), log("2026-08-01", 2), log("2026-08-02", 1)];
    expect([...habitDays(logs, "i1", 3)].sort()).toEqual(["2026-08-01"]);
  });

  it("counts any progress when the target is one", () => {
    expect([...habitDays([log("2026-08-02")], "i1")].sort()).toEqual(["2026-08-02"]);
  });

  it("ignores other items' logs", () => {
    expect(habitDays([log("2026-08-02", 1, "other")], "i1").size).toBe(0);
  });
});

describe("weekLoggedDays", () => {
  it("counts distinct days inside the Monday-start week", () => {
    // 2026-08-05 is a Wednesday; that week runs Mon 3rd to Sun 9th
    const logs = [log("2026-08-03"), log("2026-08-03"), log("2026-08-09")];
    expect(weekLoggedDays(logs, "i1", "2026-08-05")).toBe(2);
  });

  it("excludes the days either side of that week", () => {
    const logs = [log("2026-08-02"), log("2026-08-10")];
    expect(weekLoggedDays(logs, "i1", "2026-08-05")).toBe(0);
  });
});

describe("effectiveCadence", () => {
  it("defaults habits and routines to daily", () => {
    expect(effectiveCadence(item({ kind: "habit" }))).toBe("daily");
    expect(effectiveCadence(item({ kind: "routine" }))).toBe("daily");
  });

  it("leaves anything else unscheduled unless it says otherwise", () => {
    expect(effectiveCadence(item({ kind: "goal" }))).toBe(null);
    expect(effectiveCadence(item({ kind: "goal", cadence: "weekly" }))).toBe("weekly");
  });

  it("lets an explicit cadence win over the default", () => {
    expect(effectiveCadence(item({ kind: "habit", cadence: "weekdays" }))).toBe("weekdays");
  });
});

describe("routineMinutes", () => {
  it("sums the steps that have a length", () => {
    const r = item({
      kind: "routine",
      steps: [
        { id: "s1", title: "a", minutes: 5 },
        { id: "s2", title: "b", minutes: null },
        { id: "s3", title: "c", minutes: 10 },
      ],
    });
    expect(routineMinutes(r)).toBe(15);
  });

  it("is null when nothing is timed", () => {
    expect(routineMinutes(item({ kind: "routine", steps: [{ id: "s", title: "a", minutes: null }] }))).toBe(null);
    expect(routineMinutes(item({ kind: "routine", steps: [] }))).toBe(null);
  });
});

/* ————— the picked (trying) state on list entries ————— */

describe("pickedEntries", () => {
  it("returns only what is being tried, oldest pick first", () => {
    const rows = [
      entry({ id: "a", text: "new pick", pickedAt: 2000 }),
      entry({ id: "b", text: "waiting" }),
      entry({ id: "c", text: "old pick", pickedAt: 1000 }),
    ];
    expect(pickedEntries(rows).map((e) => e.id)).toEqual(["c", "a"]);
  });

  it("drops anything already done, picked or not", () => {
    const rows = [entry({ id: "a", pickedAt: 1000, done: true }), entry({ id: "b", done: true })];
    expect(pickedEntries(rows)).toEqual([]);
  });

  it("treats an entry saved before the field existed as waiting", () => {
    // rows written by an older build have no pickedAt at all
    const legacy = { id: "x", text: "old row", amount: null, unit: null, done: false } as ListEntry;
    expect(pickedEntries([legacy])).toEqual([]);
  });
});

describe("tryingFor", () => {
  const now = new Date("2026-08-05T12:00:00").getTime();
  const daysAgo = (n: number) => now - n * 86_400_000;

  it("reads as a human would say it", () => {
    expect(tryingFor(daysAgo(0), now)).toBe("today");
    expect(tryingFor(daysAgo(1), now)).toBe("1 day");
    expect(tryingFor(daysAgo(3), now)).toBe("3 days");
    expect(tryingFor(daysAgo(21), now)).toBe("3 weeks");
    expect(tryingFor(daysAgo(70), now)).toBe("2 months");
  });

  it("never counts backwards for a clock that drifted", () => {
    expect(tryingFor(now + 60_000, now)).toBe("today");
  });
});

/* ————— steps that stand for a life node ————— */

describe("linkableItems", () => {
  const db = (items: Item[]) => ({ items } as unknown as import("@/lib/types").DB);

  it("offers habits and anything else that repeats", () => {
    const rows = linkableItems(db([
      item({ id: "h", kind: "habit", title: "Duolingo" }),
      item({ id: "g", kind: "goal", title: "Weekly review", cadence: "weekly" }),
    ]));
    expect(rows.map((r) => r.id).sort()).toEqual(["g", "h"]);
  });

  it("leaves out one-off tasks, routines and anything retired", () => {
    const rows = linkableItems(db([
      item({ id: "one", kind: "goal", title: "No schedule" }),
      item({ id: "r", kind: "routine", title: "Morning routine" }),
      item({ id: "gone", kind: "habit", title: "Retired", status: "archived" }),
      item({ id: "binned", kind: "habit", title: "Deleted", deletedAt: 1 }),
    ]));
    expect(rows).toEqual([]);
  });
});

describe("routinesLinkedTo", () => {
  const routine = (id: string, title: string, steps: { id: string; itemId?: string | null }[]) =>
    item({
      id, title, kind: "routine",
      steps: steps.map((s) => ({ id: s.id, title: s.id, minutes: null, itemId: s.itemId ?? null })),
    });
  const db = (items: Item[]) => ({ items } as unknown as import("@/lib/types").DB);

  it("finds every routine whose script points at the node", () => {
    const found = routinesLinkedTo(
      db([
        routine("r1", "Morning routine", [{ id: "s1", itemId: "duo" }, { id: "s2" }]),
        routine("r2", "Evening routine", [{ id: "s3", itemId: "duo" }]),
        routine("r3", "Other", [{ id: "s4", itemId: "elsewhere" }]),
      ]),
      "duo"
    );
    expect(found.map((f) => `${f.routine.id}/${f.step.id}`)).toEqual(["r1/s1", "r2/s3"]);
  });

  it("ignores steps written before links existed", () => {
    // steps saved by an older build have no itemId field at all
    const legacy = item({
      id: "r", kind: "routine",
      steps: [{ id: "s", title: "Duolingo", minutes: 5 } as import("@/lib/types").RoutineStep],
    });
    expect(routinesLinkedTo(db([legacy]), "duo")).toEqual([]);
  });

  it("skips retired routines", () => {
    const r = routine("r", "Old", [{ id: "s", itemId: "duo" }]);
    expect(routinesLinkedTo(db([{ ...r, status: "archived" }]), "duo")).toEqual([]);
  });
});

describe("linkableItems", () => {
  const db = (items: Item[]) => ({ items } as unknown as import("@/lib/types").DB);

  it("keeps the step's current link in the list even once it is finished", () => {
    // the whole point of opening the picker on a finished book is to change it
    const rows = linkableItems(
      db([
        item({ id: "book2", title: "Book2", kind: "book", cadence: "daily", status: "done" }),
        item({ id: "book3", title: "Book3", kind: "book", cadence: "daily" }),
      ]),
      "book2"
    );
    expect(rows.map((r) => r.id).sort()).toEqual(["book2", "book3"]);
  });

  it("still leaves finished things out when they are not the current link", () => {
    const rows = linkableItems(
      db([item({ id: "book2", title: "Book2", kind: "book", cadence: "daily", status: "done" })]),
      null
    );
    expect(rows).toEqual([]);
  });
});

describe("linkIsStale", () => {
  const db = (items: Item[]) => ({ items } as unknown as import("@/lib/types").DB);

  it("is true once the target is finished, retired or gone", () => {
    expect(linkIsStale(db([item({ id: "a", status: "done" })]), "a")).toBe(true);
    expect(linkIsStale(db([item({ id: "a", status: "archived" })]), "a")).toBe(true);
    expect(linkIsStale(db([item({ id: "a", deletedAt: 1 })]), "a")).toBe(true);
    expect(linkIsStale(db([]), "vanished")).toBe(true);
  });

  it("is false for a live target, and for no link at all", () => {
    expect(linkIsStale(db([item({ id: "a" })]), "a")).toBe(false);
    expect(linkIsStale(db([item({ id: "a" })]), null)).toBe(false);
  });
});
