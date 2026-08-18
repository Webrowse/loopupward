import { describe, expect, it } from "vitest";
import { actionChangeEvents, itemChangeEvents, listEntryEvents } from "@/lib/data/changes";
import { Action, Item, ListEntry } from "@/lib/types";

function item(over: Partial<Item> = {}): Item {
  return {
    id: "i1", areaId: null, parentId: null, kind: "goal", tracker: "none",
    title: "Learn Rust", note: "", target: null, current: 0, unit: null, horizon: "quarter",
    horizonPeriod: "2026-Q3", dateRepeatsYearly: false, richBody: null, status: "active",
    cadence: null, cadenceDays: null, cadenceCount: null, steps: null, entries: null,
    windowStart: null, windowEnd: null, pulledToday: false, labels: [], pinned: false,
    position: 0, createdAt: 0, completedAt: null, deletedAt: null,
    ...over,
  };
}

function action(over: Partial<Action> = {}): Action {
  return {
    id: "a1", itemId: "i1", title: "Draft the chapter", date: "2026-08-10", done: false,
    doneAt: null, amount: 1, priority: 0, note: "", createdAt: 0,
    ...over,
  };
}

function entry(over: Partial<ListEntry> = {}): ListEntry {
  return { id: "e1", text: "Pottery", amount: null, unit: null, done: false, pickedAt: null, ...over };
}

const types = (events: { type: string }[]) => events.map((e) => e.type);

describe("item changes", () => {
  it("says nothing when nothing changed", () => {
    const before = item();
    expect(itemChangeEvents(before, { ...before })).toEqual([]);
  });

  it("records a rename with both sides of it", () => {
    const before = item();
    const events = itemChangeEvents(before, { ...before, title: "Learn Go" });
    expect(types(events)).toEqual(["item.renamed"]);
    expect(events[0].payload).toMatchObject({ from: "Learn Rust", to: "Learn Go" });
  });

  it("treats re-scoping as its own event, with the period on both sides", () => {
    // this is the one that shows a goal drifting from "this quarter" to
    // "someday" — the app overwrites in place, so nothing else can see it
    const before = item();
    const events = itemChangeEvents(before, { ...before, horizon: "someday", horizonPeriod: null });
    expect(types(events)).toEqual(["item.horizon_changed"]);
    expect(events[0].payload).toMatchObject({
      from: "quarter", to: "someday", fromPeriod: "2026-Q3", toPeriod: null,
    });
  });

  it("notices a move to a different quarter, not just a different horizon", () => {
    const before = item();
    const events = itemChangeEvents(before, { ...before, horizonPeriod: "2026-Q4" });
    expect(types(events)).toEqual(["item.horizon_changed"]);
  });

  it("reports one move when both area and parent change", () => {
    const before = item();
    const events = itemChangeEvents(before, { ...before, areaId: "ar2", parentId: "p2" });
    expect(types(events)).toEqual(["item.moved"]);
    expect(events[0].payload).toMatchObject({
      fromAreaId: null, toAreaId: "ar2", fromParentId: null, toParentId: "p2",
    });
  });

  it("ignores label reordering but catches a real change", () => {
    const before = item({ labels: ["l1", "l2"] });
    expect(itemChangeEvents(before, { ...before, labels: ["l2", "l1"] })).toEqual([]);
    expect(types(itemChangeEvents(before, { ...before, labels: ["l1"] }))).toEqual(["item.labels_changed"]);
  });

  it("distinguishes pinning from unpinning", () => {
    const before = item();
    expect(types(itemChangeEvents(before, { ...before, pinned: true }))).toEqual(["item.pinned"]);
    const pinned = item({ pinned: true });
    expect(types(itemChangeEvents(pinned, { ...pinned, pinned: false }))).toEqual(["item.unpinned"]);
  });

  it("reports every distinct change from one edit", () => {
    const before = item();
    const events = itemChangeEvents(before, {
      ...before, title: "Learn Go", kind: "project", target: 10, pinned: true,
    });
    expect(types(events).sort()).toEqual(
      ["item.kind_changed", "item.pinned", "item.renamed", "item.target_changed"].sort()
    );
  });

  it("catches a cadence change hidden in the day list rather than the cadence word", () => {
    const before = item({ cadence: "days", cadenceDays: [1, 3, 5] });
    const events = itemChangeEvents(before, { ...before, cadenceDays: [1, 3] });
    expect(types(events)).toEqual(["item.cadence_changed"]);
  });
});

describe("list entries", () => {
  it("records a line added", () => {
    const events = listEntryEvents([], [entry()], "i1");
    expect(types(events)).toEqual(["list.entry_added"]);
  });

  it("records the moment a line becomes the one being tried", () => {
    const before = [entry()];
    const after = [entry({ pickedAt: Date.now() })];
    expect(types(listEntryEvents(before, after, "i1"))).toEqual(["list.entry_picked"]);
  });

  it("records a line finished, and how long it had been in progress", () => {
    const pickedAt = Date.now() - 3 * 86_400_000;
    const before = [entry({ pickedAt })];
    const after = [entry({ pickedAt, done: true })];
    const events = listEntryEvents(before, after, "i1");
    expect(types(events)).toEqual(["list.entry_done"]);
    expect(Number(events[0].payload!.triedForMs)).toBeGreaterThan(2.9 * 86_400_000);
  });

  it("stays quiet when a list is untouched", () => {
    const rows = [entry(), entry({ id: "e2", text: "Bouldering" })];
    expect(listEntryEvents(rows, rows, "i1")).toEqual([]);
  });
});

describe("action changes", () => {
  it("records a reschedule with the direction and the distance", () => {
    const before = action();
    const events = actionChangeEvents(before, { ...before, date: "2026-08-17" });
    expect(types(events)).toEqual(["action.rescheduled"]);
    expect(events[0].payload).toMatchObject({ from: "2026-08-10", to: "2026-08-17", daysMoved: 7 });
  });

  it("records pulling a task earlier as a negative move, not as a slip", () => {
    const before = action({ date: "2026-08-17" });
    const events = actionChangeEvents(before, { ...before, date: "2026-08-15" });
    expect(events[0].payload).toMatchObject({ daysMoved: -2 });
  });

  it("distinguishes done from undone", () => {
    const before = action();
    expect(types(actionChangeEvents(before, { ...before, done: true }))).toEqual(["action.done"]);
    const done = action({ done: true });
    expect(types(actionChangeEvents(done, { ...done, done: false }))).toEqual(["action.undone"]);
  });

  it("says whether a note was gained or lost, not what it said", () => {
    const before = action();
    const events = actionChangeEvents(before, { ...before, note: "call first" });
    expect(types(events)).toEqual(["action.note_edited"]);
    expect(events[0].payload).toMatchObject({ hadNote: false, hasNote: true });
  });
});
