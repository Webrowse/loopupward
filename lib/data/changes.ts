/**
 * Turning an edit into the record of an edit.
 *
 * The app overwrites rows in place, so nothing used to survive of a change
 * except its result: an item that moved from "this quarter" to "someday" four
 * times looked exactly like one that was always someday. These functions read
 * a before and an after and say what happened, in the vocabulary of
 * EVENT_TYPES — which is what the provider then emits.
 *
 * Pure on purpose: every mutation path in the app funnels through the
 * provider's updateItem / updateAction, so getting this right here means
 * getting it right for the drag, the plan sheet and the item page at once.
 */

import { Action, EventType, Item, ListEntry, RoutineStep } from "../types";

export interface PendingEvent {
  type: EventType;
  itemId?: string | null;
  payload?: Record<string, unknown>;
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((x) => set.has(x));
}

function sameNums(a: number[] | null, b: number[] | null): boolean {
  if (a == null || b == null) return a === b;
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** A step's identity for diffing: what it is, not where it sits. */
function stepShape(s: RoutineStep) {
  return { id: s.id, title: s.title, minutes: s.minutes ?? null, optional: !!s.optional, itemId: s.itemId ?? null };
}

function sameStep(a: RoutineStep, b: RoutineStep): boolean {
  const x = stepShape(a);
  const y = stepShape(b);
  return x.title === y.title && x.minutes === y.minutes && x.optional === y.optional && x.itemId === y.itemId;
}

/**
 * What changed about a routine's script.
 *
 * Emitted so that a day months from now can be read against the script as it
 * was THEN. Without this the export has only today's steps to render history
 * against, which turns a step added last week into six months of apparent
 * failure. `fromIds`/`toIds` are what the reconstruction actually needs; the
 * rest is there so the line is readable on its own.
 */
function stepChangeEvent(prev: Item, next: Item): PendingEvent | null {
  const before = prev.steps ?? [];
  const after = next.steps ?? [];
  if (before.length === 0 && after.length === 0) return null;
  const beforeById = new Map(before.map((s) => [s.id, s]));
  const afterById = new Map(after.map((s) => [s.id, s]));
  const added = after.filter((s) => !beforeById.has(s.id));
  const removed = before.filter((s) => !afterById.has(s.id));
  const edited = after.filter((s) => {
    const old = beforeById.get(s.id);
    return old && !sameStep(old, s);
  });
  const fromIds = before.map((s) => s.id);
  const toIds = after.map((s) => s.id);
  const reordered =
    added.length === 0 && removed.length === 0 && fromIds.join(",") !== toIds.join(",");
  if (added.length === 0 && removed.length === 0 && edited.length === 0 && !reordered) return null;
  return {
    type: "item.steps_changed",
    itemId: next.id,
    payload: {
      fromIds,
      toIds,
      added: added.map(stepShape),
      removed: removed.map(stepShape),
      edited: edited.map((s) => ({ from: stepShape(beforeById.get(s.id)!), to: stepShape(s) })),
      reordered,
    },
  };
}

/** Everything that changed between two versions of one item. */
export function itemChangeEvents(prev: Item, next: Item): PendingEvent[] {
  const out: PendingEvent[] = [];
  const at = (type: EventType, payload: Record<string, unknown>) =>
    out.push({ type, itemId: next.id, payload });

  if (prev.title !== next.title) at("item.renamed", { from: prev.title, to: next.title });
  if (prev.kind !== next.kind) at("item.kind_changed", { from: prev.kind, to: next.kind });
  if (prev.tracker !== next.tracker) at("item.tracker_changed", { from: prev.tracker, to: next.tracker });

  // re-scoping: the interesting one. "Someday" is where a year's worth of
  // intentions quietly goes, and only this event can ever show that journey.
  if (prev.horizon !== next.horizon || prev.horizonPeriod !== next.horizonPeriod) {
    at("item.horizon_changed", {
      from: prev.horizon,
      to: next.horizon,
      fromPeriod: prev.horizonPeriod,
      toPeriod: next.horizonPeriod,
      horizonPeriod: next.horizonPeriod,
    });
  }
  // unit travels with the target: "200" means nothing without "workouts", and
  // a unit change alone still changes what every past number meant
  if (prev.target !== next.target || prev.unit !== next.unit) {
    at("item.target_changed", {
      from: prev.target, to: next.target,
      fromUnit: prev.unit, toUnit: next.unit,
    });
  }
  if (prev.cadence !== next.cadence || !sameNums(prev.cadenceDays, next.cadenceDays) || prev.cadenceCount !== next.cadenceCount) {
    at("item.cadence_changed", {
      from: prev.cadence, to: next.cadence,
      fromDays: prev.cadenceDays, toDays: next.cadenceDays,
      fromCount: prev.cadenceCount, toCount: next.cadenceCount,
    });
  }
  if (prev.windowStart !== next.windowStart || prev.windowEnd !== next.windowEnd) {
    at("item.window_changed", {
      from: prev.windowStart ? `${prev.windowStart}–${prev.windowEnd ?? ""}` : null,
      to: next.windowStart ? `${next.windowStart}–${next.windowEnd ?? ""}` : null,
    });
  }
  if (prev.areaId !== next.areaId || prev.parentId !== next.parentId) {
    at("item.moved", {
      fromAreaId: prev.areaId, toAreaId: next.areaId,
      fromParentId: prev.parentId, toParentId: next.parentId,
    });
  }
  if (!sameSet(prev.labels, next.labels)) {
    at("item.labels_changed", { from: prev.labels, to: next.labels });
  }
  if (prev.pinned !== next.pinned) out.push({ type: next.pinned ? "item.pinned" : "item.unpinned", itemId: next.id });

  // shelving. completeItem/reopenItem announce themselves, but the Someday and
  // Make active buttons go through here — and "Make active" used to change
  // nothing else, so coming back to a shelved ambition left no trace at all.
  if (prev.status !== next.status) {
    at("item.status_changed", { from: prev.status, to: next.status });
  }

  // the script, so history can be read against the steps that existed then
  const steps = stepChangeEvent(prev, next);
  if (steps) out.push(steps);

  // the body: char counts only, never the text. This says WHEN thinking moved,
  // which is the part the current text can never recover; what it moved to is
  // in the note itself.
  if (prev.richBody !== next.richBody) {
    at("item.body_edited", {
      field: "richBody",
      fromChars: prev.richBody?.length ?? 0,
      toChars: next.richBody?.length ?? 0,
    });
  }
  if (prev.note !== next.note) {
    at("item.body_edited", { field: "note", fromChars: prev.note.length, toChars: next.note.length });
  }

  if (prev.pulledToday !== next.pulledToday) {
    at("item.pulled_today_changed", { to: next.pulledToday, horizon: next.horizon });
  }

  out.push(...listEntryEvents(prev.entries, next.entries, next.id));
  return out;
}

/** Lists are edited as a whole array, so their three interesting moments —
 *  a line added, a line picked up as the thing being tried, a line ticked —
 *  have to be read out of the difference between two arrays. */
export function listEntryEvents(
  prev: ListEntry[] | null,
  next: ListEntry[] | null,
  itemId: string
): PendingEvent[] {
  if (!next) return [];
  const before = new Map((prev ?? []).map((e) => [e.id, e]));
  const out: PendingEvent[] = [];
  for (const entry of next) {
    const old = before.get(entry.id);
    if (!old) {
      out.push({ type: "list.entry_added", itemId, payload: { entryId: entry.id, text: entry.text } });
      continue;
    }
    if (!old.pickedAt && entry.pickedAt) {
      out.push({ type: "list.entry_picked", itemId, payload: { entryId: entry.id, text: entry.text } });
    }
    if (!old.done && entry.done) {
      out.push({
        type: "list.entry_done",
        itemId,
        payload: {
          entryId: entry.id,
          text: entry.text,
          // how long it sat as "the one I'm on" before it was finished
          triedForMs: entry.pickedAt ? Date.now() - entry.pickedAt : old.pickedAt ? Date.now() - old.pickedAt : null,
        },
      });
    }
  }
  return out;
}

/** What changed about one planned task. `action.rescheduled` is the
 *  procrastination signal, so every path that touches a date reaches this. */
export function actionChangeEvents(prev: Action, next: Action): PendingEvent[] {
  const out: PendingEvent[] = [];
  if (prev.date !== next.date) {
    out.push({
      type: "action.rescheduled",
      itemId: next.itemId,
      payload: {
        actionId: next.id,
        title: next.title,
        from: prev.date,
        to: next.date,
        daysMoved: Math.round(
          (new Date(`${next.date}T12:00:00`).getTime() - new Date(`${prev.date}T12:00:00`).getTime()) / 86_400_000
        ),
      },
    });
  }
  if (prev.amount !== next.amount) {
    out.push({
      type: "action.amount_changed",
      itemId: next.itemId,
      payload: { actionId: next.id, from: prev.amount, to: next.amount },
    });
  }
  if (prev.priority !== next.priority) {
    out.push({
      type: "action.priority_changed",
      itemId: next.itemId,
      payload: { actionId: next.id, from: prev.priority, to: next.priority },
    });
  }
  if (prev.note !== next.note) {
    out.push({
      type: "action.note_edited",
      itemId: next.itemId,
      payload: { actionId: next.id, hadNote: !!prev.note.trim(), hasNote: !!next.note.trim() },
    });
  }
  if (prev.done !== next.done) {
    out.push({
      type: next.done ? "action.done" : "action.undone",
      itemId: next.itemId,
      payload: { actionId: next.id, title: next.title, plannedFor: next.date },
    });
  }
  return out;
}
