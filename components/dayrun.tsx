"use client";

import { useMemo, useState } from "react";
import { useLife } from "@/lib/data/provider";
import { todayEntries, TodayEntry } from "@/lib/progress";
import { useRowDrag } from "@/lib/useRowDrag";
import { Chip, Sheet } from "@/components/ui";

/** One task in a planned run: which row, and how long it gets. */
export interface DayRunStep {
  entryId: string;
  /** null runs a count-up instead of a countdown */
  minutes: number | null;
}

const LENGTHS = [5, 10, 15, 25, 45];

/** A habit's day-specific plan leads, same rule the rest of the app follows. */
function rowText(entry: TodayEntry): string {
  return entry.virtualHabit && entry.action.note ? entry.action.note : entry.action.title;
}

/** "1 hr 15 min", "45 min" — a total that reads like time, not arithmetic. */
function prettyTotal(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

/**
 * Choosing what today's run will be: which of the day's open tasks come along,
 * in what order, and which of them get a countdown.
 *
 * Routines are deliberately absent. They already have a script of their own
 * and their own ▶ Run, and flattening one into this list would turn a five
 * step routine into five entries you never wrote down.
 *
 * Blank is the default length on purpose: a to-do rarely has a natural
 * duration, and inventing twenty-five minutes for "email the accountant"
 * turns a day into a treadmill. Blank runs a count-up, which is the runner's
 * existing untimed mode.
 */
export function DayRunSheet({
  open, day, onClose, onStart,
}: {
  open: boolean;
  day: string;
  onClose: () => void;
  onStart: (plan: DayRunStep[]) => void;
}) {
  const { db } = useLife();
  const candidates = useMemo(
    () =>
      todayEntries(db, day).filter(
        (e) => !e.action.done && e.item?.kind !== "routine"
      ),
    [db, day]
  );

  // chosen ids in run order, and the length each one was given
  const [order, setOrder] = useState<string[] | null>(null);
  const [dropped, setDropped] = useState<string[]>([]);
  const [lengths, setLengths] = useState<Record<string, number | null>>({});
  const [editing, setEditing] = useState<string | null>(null);

  // the sheet opens fresh each time: a run is not a thing you keep
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setOrder(null);
      setDropped([]);
      setLengths({});
      setEditing(null);
    }
  }

  const ids = order ?? candidates.map((e) => e.action.id);
  const byId = new Map(candidates.map((e) => [e.action.id, e]));
  const live = ids.filter((id) => byId.has(id));
  const chosen = live.filter((id) => !dropped.includes(id));

  const { order: dragOrder, draggingId, rowRef, handleProps } = useRowDrag(live, setOrder);

  const timed = chosen.filter((id) => lengths[id] != null);
  const total = timed.reduce((sum, id) => sum + (lengths[id] ?? 0), 0);

  const summary = () => {
    if (chosen.length === 0) return "Nothing picked yet";
    const openEnded = chosen.length - timed.length;
    if (timed.length === 0) return `${chosen.length} to walk through, none timed`;
    if (openEnded === 0) return `${prettyTotal(total)} all together`;
    return `${prettyTotal(total)} timed, plus ${openEnded} open-ended`;
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Choose what to run"
      primary={{
        label: chosen.length ? `Start with ${chosen.length}` : "Start",
        onClick: () => onStart(chosen.map((id) => ({ entryId: id, minutes: lengths[id] ?? null }))),
      }}
      primaryDisabled={chosen.length === 0}
    >
      {candidates.length === 0 ? (
        <p className="text-sm text-ink-3">
          Nothing open to run. Routines have their own ▶ Run on the list.
        </p>
      ) : (
        <>
          <p className="mb-3 text-sm leading-relaxed text-ink-2">
            Pick what this stretch is for and drag it into the order you want. Leave a length
            blank and that one simply counts up until you tick it.
          </p>

          <div className="mb-2 divide-y divide-line-soft rounded-(--radius-card) border border-line-soft bg-surface">
            {dragOrder.map((id, i) => {
              const entry = byId.get(id);
              if (!entry) return null;
              const isIn = !dropped.includes(id);
              const len = lengths[id] ?? null;
              return (
                <div
                  key={id}
                  ref={rowRef(id)}
                  className={`relative flex items-center gap-2 bg-surface px-3 py-2 ${
                    draggingId === id ? "z-20 shadow-(--shadow-float)" : ""
                  } ${isIn ? "" : "opacity-45"}`}
                >
                  <button
                    {...handleProps(id)}
                    aria-label={`Drag ${rowText(entry)} to reorder`}
                    className="shrink-0 touch-none cursor-grab px-1 text-ink-3 active:cursor-grabbing"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                      <circle cx="4" cy="3" r="1.3" /><circle cx="10" cy="3" r="1.3" />
                      <circle cx="4" cy="7" r="1.3" /><circle cx="10" cy="7" r="1.3" />
                      <circle cx="4" cy="11" r="1.3" /><circle cx="10" cy="11" r="1.3" />
                    </svg>
                  </button>

                  <button
                    onClick={() =>
                      setDropped((prev) => (isIn ? [...prev, id] : prev.filter((x) => x !== id)))
                    }
                    aria-label={isIn ? `Leave out ${rowText(entry)}` : `Bring back ${rowText(entry)}`}
                    className={`pressable grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 transition-colors ${
                      isIn ? "border-accent bg-accent text-white dark:text-[#10160f]" : "border-line"
                    }`}
                  >
                    {isIn && (
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6.5 4.8 9 10 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>

                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{rowText(entry)}</span>

                  <button
                    onClick={() => setEditing(editing === id ? null : id)}
                    aria-label={`Set how long ${rowText(entry)} gets`}
                    className={`pressable shrink-0 rounded-full border px-2 py-0.5 text-[0.7rem] font-medium tabular-nums ${
                      len != null
                        ? "border-accent text-accent-deep"
                        : "border-line text-ink-3 hover:border-accent hover:text-accent-deep"
                    }`}
                  >
                    {len != null ? `${len} min` : "no timer"}
                  </button>
                  {i === dragOrder.length - 1 && null}

                  {editing === id && (
                    <div className="absolute right-2 top-full z-30 mt-1 flex flex-wrap gap-1 rounded-xl border border-line-soft bg-surface p-2 shadow-(--shadow-float)">
                      <Chip
                        active={len == null}
                        onClick={() => { setLengths((p) => ({ ...p, [id]: null })); setEditing(null); }}
                      >
                        none
                      </Chip>
                      {LENGTHS.map((m) => (
                        <Chip
                          key={m}
                          active={len === m}
                          onClick={() => { setLengths((p) => ({ ...p, [id]: m })); setEditing(null); }}
                        >
                          {m}
                        </Chip>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-xs font-medium text-accent-deep tabular-nums">{summary()}</p>
          <p className="mt-2 text-xs leading-relaxed text-ink-3">
            Nothing here is saved — tomorrow you pick again. Routines keep their own ▶ Run.
          </p>
        </>
      )}
    </Sheet>
  );
}
