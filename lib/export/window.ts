/**
 * Narrowing an export to one stretch of time.
 *
 * A naive row filter would produce a broken bundle. Two things go wrong:
 *
 *  1. **Dangling references.** A week's logs point at goals created two years
 *     earlier. Drop those items and every row in the window names an id that
 *     resolves to nothing. So the window keeps the *referenced closure*: every
 *     item, area and label any surviving row mentions, each flagged with
 *     whether it belongs to the window itself or is only there to be pointed
 *     at.
 *
 *  2. **No opening balance.** A counter that moved 3 -> 7 inside the window is
 *     uninterpretable if you cannot see it started at 3. The full history is
 *     available while the bundle is being built, so the value each tracker held
 *     at the window's first moment is computed here and carried alongside.
 *
 * Everything else about a scoped bundle is identical to a whole-life one: same
 * files, same columns, same rules. That is deliberate. Two scoped exports can
 * be compared, or concatenated, without reconciling two schemas.
 */

import { dayFromMs } from "../dates";
import { DB, Item, Streams } from "../types";

export interface ExportWindow {
  /** inclusive local days */
  start: string;
  end: string;
  /** how the window was chosen, for the manifest */
  label: string;
}

/** What a tracker read at the instant the window opened. */
export interface OpeningValue {
  itemId: string;
  /** running total of `add` logs before the window, or the last `set` snapshot */
  value: number;
  /** true when nothing at all was recorded before the window */
  fromZero: boolean;
}

export interface ScopedData {
  db: DB;
  streams: Streams;
  /** ids that fall inside the window; everything else is closure-only context */
  inWindow: Set<string>;
  opening: Map<string, OpeningValue>;
}

const within = (day: string | null | undefined, w: ExportWindow) =>
  !!day && day >= w.start && day <= w.end;

/**
 * The value each item's tracker held when the window opened.
 *
 * Mirrors how the app reads its own logs: cumulative trackers sum their `add`
 * deltas, point-in-time ones take the last `set` before the window. Mixing the
 * two would give nonsense, which is the same warning the README gives readers.
 */
export function openingValues(db: DB, w: ExportWindow): Map<string, OpeningValue> {
  const out = new Map<string, OpeningValue>();
  const before = db.logs.filter((l) => l.date < w.start);
  const byItem = new Map<string, typeof before>();
  for (const l of before) {
    const list = byItem.get(l.itemId);
    if (list) list.push(l);
    else byItem.set(l.itemId, [l]);
  }
  for (const [itemId, logs] of byItem) {
    const sorted = [...logs].sort((a, b) => a.createdAt - b.createdAt);
    const lastSet = [...sorted].reverse().find((l) => l.op === "set");
    const value = lastSet
      ? lastSet.value +
        sorted.filter((l) => l.op === "add" && l.createdAt > lastSet.createdAt).reduce((s, l) => s + l.value, 0)
      : sorted.filter((l) => l.op === "add").reduce((s, l) => s + l.value, 0);
    out.set(itemId, { itemId, value, fromZero: false });
  }
  for (const item of db.items) {
    if (!out.has(item.id)) out.set(item.id, { itemId: item.id, value: 0, fromZero: true });
  }
  return out;
}

/**
 * Cut everything down to the window, then add back whatever the survivors
 * point at. The closure walks parents too: an action names a goal, the goal
 * sits inside a project, and a reader following `parent_id` upward should never
 * fall off the end of the file.
 */
export function scopeToWindow(db: DB, streams: Streams, w: ExportWindow): ScopedData {
  const actions = db.actions.filter((a) => within(a.date, w));
  const logs = db.logs.filter((l) => within(l.date, w));
  const journal = db.journal.filter((j) => within(j.date, w));
  const habitDayNotes = db.habitDayNotes.filter((n) => within(n.date, w));
  const dayOrder = db.dayOrder.filter((d) => within(d.date, w));
  const seeds = db.seeds.filter((s) => within(dayFromMs(s.createdAt), w));
  const focusSessions = streams.focusSessions.filter((s) => within(s.day, w));
  const events = streams.events.filter((e) => within(e.day, w));
  // a reflection covers a period, so it belongs if its period overlaps at all;
  // its own key is the cheapest test that works for every period length
  const reflections = db.reflections.filter(
    (r) => r.periodKey >= w.start.slice(0, 4) && within(dayFromMs(r.createdAt), w)
  );

  // items whose own life touched the window, before closure
  const inWindow = new Set<string>();
  for (const i of db.items) {
    const born = dayFromMs(i.createdAt);
    const done = i.completedAt ? dayFromMs(i.completedAt) : null;
    const gone = i.deletedAt ? dayFromMs(i.deletedAt) : null;
    if (within(born, w) || within(done, w) || within(gone, w)) inWindow.add(i.id);
  }
  for (const a of actions) if (a.itemId) inWindow.add(a.itemId);
  for (const l of logs) inWindow.add(l.itemId);
  for (const n of habitDayNotes) inWindow.add(n.itemId);
  for (const s of focusSessions) if (s.itemId) inWindow.add(s.itemId);
  for (const e of events) if (e.itemId) inWindow.add(e.itemId);
  for (const s of seeds) if (s.itemId) inWindow.add(s.itemId);

  // closure: pull in ancestors and any linked routine targets, so no id in the
  // bundle points at a row the bundle does not contain
  const byId = new Map(db.items.map((i) => [i.id, i]));
  const keep = new Set(inWindow);
  const queue = [...inWindow];
  while (queue.length) {
    const item = byId.get(queue.shift()!);
    if (!item) continue;
    const related: (string | null | undefined)[] = [item.parentId];
    for (const step of item.steps ?? []) related.push(step.itemId);
    for (const id of related) {
      if (id && byId.has(id) && !keep.has(id)) {
        keep.add(id);
        queue.push(id);
      }
    }
  }

  const items: Item[] = db.items.filter((i) => keep.has(i.id));
  const areaIds = new Set(items.map((i) => i.areaId).filter((x): x is string => !!x));
  const labelIds = new Set(items.flatMap((i) => i.labels));

  return {
    db: {
      areas: db.areas.filter((a) => areaIds.has(a.id)),
      items,
      seeds,
      actions,
      logs,
      reflections,
      journal,
      labels: db.labels.filter((l) => labelIds.has(l.id)),
      habitDayNotes,
      dayOrder,
    },
    streams: { focusSessions, events },
    inWindow,
    opening: openingValues(db, w),
  };
}
