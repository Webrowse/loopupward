/**
 * What an item's settings were on a day in the past.
 *
 * The export used to render every historical row against the item as it looks
 * TODAY. Raise a water habit from two glasses to three and every past two-glass
 * day turned into a failure; add a step to a routine and it appeared undone on
 * all two hundred preceding mornings. Both are the same bug: today's definition
 * standing in for a definition nobody recorded.
 *
 * The change events carry the answer, but only back to the day the event stream
 * itself began — so the second job of this module is knowing where its own
 * knowledge stops. Everything here returns `known: false` rather than a
 * plausible guess, and the files that use it leave the cell empty. An empty
 * cell is a fact about the record; a wrong cell is a fact about the person.
 *
 * The one rule that makes it work: an item with an `item.created` event was
 * born inside the observed window, so every change it has ever had is in the
 * stream and its whole life is reconstructable. Anything older is knowable only
 * from the first event onwards.
 */

import { AppEvent, Cadence, Item } from "../types";

interface Change<T> {
  /** the local day the change was made on; a change on day D applies to D */
  day: string;
  from: T;
}

export interface ItemHistory {
  /** the first day any event was recorded — the edge of what can be known */
  streamStartDay: string | null;
  /** items with a birth event: fully reconstructable, however old the day */
  bornInWindow: Set<string>;
  targetChanges: Map<string, Change<number | null>[]>;
  cadenceChanges: Map<string, Change<CadenceShape>[]>;
  stepChanges: Map<string, Change<string[]>[]>;
  /** actionId → how the task came to exist, from action.created */
  actionOrigin: Map<string, string>;
  /** itemId → how the item came to exist, from item.created */
  itemOrigin: Map<string, string>;
}

export interface CadenceShape {
  cadence: Cadence;
  cadenceDays: number[] | null;
  cadenceCount: number | null;
}

export interface Known<T> {
  value: T;
  known: boolean;
}

function push<T>(map: Map<string, Change<T>[]>, id: string, change: Change<T>) {
  const list = map.get(id);
  if (list) list.push(change);
  else map.set(id, [change]);
}

const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** Index the change events once, so the per-day lookups below are cheap. */
export function buildHistory(events: AppEvent[]): ItemHistory {
  const h: ItemHistory = {
    streamStartDay: null,
    bornInWindow: new Set(),
    targetChanges: new Map(),
    cadenceChanges: new Map(),
    stepChanges: new Map(),
    actionOrigin: new Map(),
    itemOrigin: new Map(),
  };
  let earliest: number | null = null;
  let earliestDay: string | null = null;

  for (const e of events) {
    if (earliest === null || e.at < earliest) {
      earliest = e.at;
      earliestDay = e.day;
    }
    const p = e.payload as Record<string, unknown>;
    switch (e.type) {
      case "item.created":
        if (e.itemId) {
          h.bornInWindow.add(e.itemId);
          if (typeof p.origin === "string") h.itemOrigin.set(e.itemId, p.origin);
        }
        break;
      case "item.target_changed":
        if (e.itemId) push(h.targetChanges, e.itemId, { day: e.day, from: num(p.from) });
        break;
      case "item.cadence_changed":
        if (e.itemId) {
          push(h.cadenceChanges, e.itemId, {
            day: e.day,
            from: {
              cadence: (p.from ?? null) as Cadence,
              cadenceDays: Array.isArray(p.fromDays) ? (p.fromDays as number[]) : null,
              cadenceCount: num(p.fromCount),
            },
          });
        }
        break;
      case "item.steps_changed":
        if (e.itemId) push(h.stepChanges, e.itemId, { day: e.day, from: ids(p.fromIds) });
        break;
      case "action.created":
        if (typeof p.actionId === "string" && typeof p.origin === "string") {
          h.actionOrigin.set(p.actionId, p.origin);
        }
        break;
    }
  }

  h.streamStartDay = earliestDay;
  // newest first: walking back from today means taking each change's `from`
  for (const list of [...h.targetChanges.values(), ...h.cadenceChanges.values(), ...h.stepChanges.values()]) {
    list.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  }
  return h;
}

/**
 * Can this item's state on `day` be reconstructed at all?
 *
 * Yes if it was born inside the observed window (every change it ever had is
 * recorded), or if the day itself falls inside that window (whatever the state
 * was then, every change since is recorded, so walking back from today lands on
 * it). Otherwise no, and no amount of looking at today's values will help.
 */
export function stateKnown(h: ItemHistory, itemId: string, day: string): boolean {
  if (h.bornInWindow.has(itemId)) return true;
  return h.streamStartDay !== null && day >= h.streamStartDay;
}

/** Walk today's value backwards through every change made after `day`. */
function rewind<T>(current: T, changes: Change<T>[] | undefined, day: string): T {
  let value = current;
  for (const c of changes ?? []) {
    if (c.day > day) value = c.from;
  }
  return value;
}

/** The tracker target this item carried on `day` — 3 glasses, 20 chapters. */
export function targetAsOfDay(h: ItemHistory, item: Item, day: string): Known<number | null> {
  const known = stateKnown(h, item.id, day);
  return { value: known ? rewind(item.target, h.targetChanges.get(item.id), day) : null, known };
}

/** The daily amount a habit day had to reach on `day` to count as done. Mirrors
 *  habitDailyTarget() in lib/progress.ts, against the target of the time. */
export function dailyTargetAsOfDay(h: ItemHistory, item: Item, day: string): Known<number | null> {
  const t = targetAsOfDay(h, item, day);
  if (!t.known) return { value: null, known: false };
  const isHabit = item.tracker === "habit";
  return { value: isHabit && t.value && t.value > 1 ? t.value : 1, known: true };
}

/** The schedule this item was on, on `day`. */
export function cadenceAsOfDay(h: ItemHistory, item: Item, day: string): Known<CadenceShape> {
  const current: CadenceShape = {
    cadence: item.cadence,
    cadenceDays: item.cadenceDays,
    cadenceCount: item.cadenceCount,
  };
  const known = stateKnown(h, item.id, day);
  return { value: known ? rewind(current, h.cadenceChanges.get(item.id), day) : current, known };
}

/**
 * Which steps a routine's script held on `day`.
 *
 * Null with `known: false` means the script of the time is genuinely unknown —
 * the caller must not fall back to today's, which is the bug this exists for.
 */
export function stepIdsAsOfDay(h: ItemHistory, item: Item, day: string): Known<Set<string> | null> {
  const known = stateKnown(h, item.id, day);
  if (!known) return { value: null, known: false };
  const current = (item.steps ?? []).map((s) => s.id);
  return { value: new Set(rewind(current, h.stepChanges.get(item.id), day)), known: true };
}
