"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLife } from "@/lib/data/provider";
import { Cadence, destinationFor, Horizon, HORIZON_META, Item, ItemKind, KIND_META, TrackerType } from "@/lib/types";
import {
  children as childrenOf, currentStreak, formatValue, habitDailyTarget, habitDays,
  horizonEntries, itemProgress, ownProgress, scheduleLabel,
} from "@/lib/progress";
import {
  addDays, addMonths, addYears, boundingRange, firstAnchorWithin, fromDay, nextAnchor, Period,
  previousAnchor, prettyDay, prettyPeriod, startOfMonth, startOfWeek, today,
} from "@/lib/dates";
import { AREA_COLORS, areaColor } from "@/lib/palette";
import { KindIcon } from "./icons";
import { Bar } from "./progress";
import { Button, Chip, EmptyState, Field, MovedNotice, Sheet, inputCls } from "./ui";

/* ————— Item card ————— */

export function ItemCard({ item, hideLabelIds }: { item: Item; hideLabelIds?: string[] }) {
  const { db, theme } = useLife();
  const router = useRouter();
  const progress = itemProgress(db, item);
  const kids = childrenOf(db, item.id);
  const area = db.areas.find((a) => a.id === item.areaId);
  const c = areaColor(area?.color);
  const color = theme === "dark" ? c.fgDark : c.fg;
  const streak =
    item.kind === "habit" ? currentStreak(habitDays(db.logs, item.id, habitDailyTarget(item))) : 0;
  // defensive dedupe: a label id should never repeat, but never show it twice if it does
  const visibleLabels = [...new Set(item.labels)].filter((lid) => !hideLabelIds?.includes(lid));

  return (
    <button
      onClick={() => router.push(`/item/${item.id}`)}
      className="pressable block w-full text-left bg-surface rounded-(--radius-card) border border-line-soft shadow-(--shadow-card) px-4 py-3.5"
    >
      <div className="flex items-start gap-3">
        <KindIcon kind={item.kind} className="mt-0.5 h-[18px] w-[18px] shrink-0 text-ink-2" />
        <div className="min-w-0 flex-1">
          <div className={`text-[0.95rem] font-medium leading-snug ${item.status === "done" ? "text-ink-3 line-through decoration-ink-3/50" : "text-ink"}`}>
            {item.title}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-ink-3">
            {area && (
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                {area.name}
              </span>
            )}
            {kids.length > 0 && <span>{kids.length} inside</span>}
            {item.kind === "habit" && streak > 0 && (
              <span className="text-amber font-medium">{streak} day streak</span>
            )}
            {trackerCaption(item)}
            {visibleLabels.slice(0, 3).map((lid) => {
              const l = db.labels.find((x) => x.id === lid);
              return l ? <span key={lid}>{l.emoji} {l.name}</span> : null;
            })}
            {scheduleLabel(item) && <span>{scheduleLabel(item)}</span>}
            {item.horizon && (
              <span className="rounded-full bg-surface-2 px-1.5 py-px">
                {HORIZON_META.find((h) => h.value === item.horizon)?.label.toLowerCase() ?? item.horizon}
              </span>
            )}
          </div>
        </div>
        {progress !== null && item.tracker !== "habit" && (
          <span className="shrink-0 text-xs font-medium text-ink-2 tabular-nums pt-1">
            {Math.round(progress * 100)}%
          </span>
        )}
      </div>
      {progress !== null && item.status !== "done" && (
        <div className="mt-2.5 pl-8">
          <Bar value={progress} color={color} height={6} />
        </div>
      )}
    </button>
  );
}

/* ————— Horizon lists: "this week / month / quarter / year" ————— */

export function HorizonList({ period, anchor }: { period: Period; anchor: string }) {
  const { db, updateItem } = useLife();
  const [adding, setAdding] = useState(false);
  const [hideDone, setHideDone] = useState(false);
  const [justMoved, setJustMoved] = useState<{ title: string; undo: () => void } | null>(null);
  const entries = useMemo(() => horizonEntries(db, period, anchor), [db, period, anchor]);
  const visible = hideDone ? entries.filter((i) => i.status !== "done") : entries;
  const label = HORIZON_META.find((h) => h.value === period)?.label ?? period;

  // moving something to Today drops it out of this list — a schedule left
  // over from before (e.g. a "monthly" cadence already satisfied this
  // month) would otherwise silently keep it from ever showing up there, so
  // this clears it too. Capture the old values so Undo can restore them.
  const moveToToday = (item: Item) => {
    const before = {
      horizon: item.horizon, horizonPeriod: item.horizonPeriod,
      cadence: item.cadence, cadenceDays: item.cadenceDays, cadenceCount: item.cadenceCount,
    };
    updateItem(item.id, { horizon: "today", horizonPeriod: null, cadence: null, cadenceDays: null, cadenceCount: null });
    setJustMoved({ title: item.title, undo: () => { updateItem(item.id, before); setJustMoved(null); } });
  };

  return (
    <div>
      {justMoved && (
        <MovedNotice
          message={`Moved "${justMoved.title}" to Today.`}
          href="/today"
          hrefLabel="View Today"
          onUndo={justMoved.undo}
          onDismiss={() => setJustMoved(null)}
        />
      )}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-ink-2">
          {entries.length === 0 ? `Nothing planned for ${label.toLowerCase()}` : `${entries.length} for ${label.toLowerCase()}`}
        </p>
        <div className="flex items-center gap-3">
          {entries.some((i) => i.status === "done") && (
            <button
              onClick={() => setHideDone((v) => !v)}
              className="pressable text-xs font-medium text-ink-3 hover:text-ink-2"
            >
              {hideDone ? "Show completed" : "Hide completed"}
            </button>
          )}
          <Button small variant="ghost" onClick={() => setAdding(true)}>+ Add</Button>
        </div>
      </div>

      {entries.length === 0 ? (
        <EmptyState
          emoji="🗓"
          title={`Nothing tagged "${label}"`}
          body={`Add something here, or open any goal and set its planning horizon to ${label.toLowerCase()}.`}
        />
      ) : visible.length === 0 ? (
        <EmptyState emoji="✓" title="Everything's done" body="Show completed to see it all again." />
      ) : (
        <div className="space-y-2">
          {visible.map((item) => (
            <HorizonRow key={item.id} item={item} onMoveToday={moveToToday} />
          ))}
        </div>
      )}

      <ItemSheet
        open={adding}
        onClose={() => setAdding(false)}
        defaultHorizon={period}
        defaultHorizonPeriod={anchor}
      />
    </div>
  );
}

function HorizonRow({ item, onMoveToday }: { item: Item; onMoveToday: (item: Item) => void }) {
  const { db, theme, completeItem, reopenItem } = useLife();
  const progress = itemProgress(db, item);
  const kids = childrenOf(db, item.id);
  const area = db.areas.find((a) => a.id === item.areaId);
  const c = areaColor(area?.color);
  const color = theme === "dark" ? c.fgDark : c.fg;
  const done = item.status === "done";

  return (
    <div className={`flex items-center gap-3 rounded-(--radius-card) border border-line-soft bg-surface px-4 py-3 shadow-(--shadow-card) transition-opacity ${done ? "opacity-60" : ""}`}>
      <button
        onClick={() => (done ? reopenItem(item.id) : completeItem(item.id))}
        aria-label={done ? "Undo" : "Mark done"}
        className={`pressable relative grid h-6 w-6 shrink-0 place-items-center rounded-lg border-2 transition-colors ${
          done ? "border-accent bg-accent text-white dark:text-[#10160f]" : "border-line hover:border-accent"
        }`}
      >
        {done && (
          <svg className="bloom" width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6.5 4.8 9 10 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <Link href={`/item/${item.id}`} className="min-w-0 flex-1">
        <div className={`truncate text-[0.95rem] leading-snug ${done ? "text-ink-3 line-through decoration-ink-3/40" : "text-ink"}`}>
          {item.title}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-3">
          {area && (
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
              {area.name}
            </span>
          )}
          {kids.length > 0 && progress !== null && (
            <span className="tabular-nums">{Math.round(progress * 100)}% · {kids.length} inside</span>
          )}
          {scheduleLabel(item) && <span>{scheduleLabel(item)}</span>}
        </div>
      </Link>
      {!done && (
        <button
          onClick={() => onMoveToday(item)}
          className="pressable shrink-0 text-xs font-medium text-accent-deep"
        >
          → Today
        </button>
      )}
    </div>
  );
}

function trackerCaption(item: Item) {
  if (item.tracker === "counter" || item.tracker === "book" || item.tracker === "money") {
    return (
      <span className="tabular-nums">
        {formatValue(item, item.current)}
        {item.target != null && ` / ${formatValue(item, item.target)}`}
      </span>
    );
  }
  if (item.tracker === "percent") return <span className="tabular-nums">{Math.round(item.current)}%</span>;
  return null;
}

/* ————— Tracker controls (item page) ————— */

export function TrackerControls({ item }: { item: Item }) {
  const { setTracker } = useLife();
  const [editValue, setEditValue] = useState<string | null>(null);
  // +/- only adjusts this local draft; nothing is written until Save, so
  // tapping it ten times doesn't leave ten entries in History
  const [pending, setPending] = useState<number | null>(null);

  if (item.tracker === "none" || item.tracker === "check" || item.tracker === "habit") return null;

  const step = item.tracker === "money" ? Math.max(1, Math.round((item.target ?? 1000) / 100)) : 1;
  const value = pending ?? item.current;
  const dirty = pending !== null && pending !== item.current;

  const save = () => {
    if (pending !== null) setTracker(item, pending);
    setPending(null);
  };

  return (
    <div>
      <div className="flex items-center gap-3">
        <Button small variant="soft" onClick={() => setPending(Math.max(0, value - step))}>
          −{step > 1 ? step.toLocaleString() : ""}
        </Button>
        {editValue === null ? (
          <button
            className="font-display text-2xl text-ink tabular-nums flex-1 text-center"
            onClick={() => setEditValue(String(value))}
          >
            {formatValue(item, value)}
            {item.target != null && (
              <span className="text-ink-3 text-lg"> / {formatValue(item, item.target)}</span>
            )}
          </button>
        ) : (
          <input
            autoFocus
            type="number"
            className={`${inputCls} text-center flex-1`}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => {
              const v = parseFloat(editValue);
              if (!Number.isNaN(v)) setPending(Math.max(0, v));
              setEditValue(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          />
        )}
        <Button small variant="soft" onClick={() => setPending(value + step)}>
          +{step > 1 ? step.toLocaleString() : ""}
        </Button>
      </div>
      {dirty && (
        <div className="mt-2.5 flex justify-end">
          <Button small onClick={save}>Save</Button>
        </div>
      )}
    </div>
  );
}

/* ————— Create / edit sheet ————— */

const TRACKER_OPTIONS: { value: TrackerType; label: string; hint: string }[] = [
  { value: "none", label: "Just exists", hint: "a note, a thought, or measured by what's inside it" },
  { value: "check", label: "Done / not done", hint: "one clear finish line" },
  { value: "counter", label: "Count", hint: "workout 200 times, read 20 books" },
  { value: "percent", label: "Percent", hint: "course 45% complete" },
  { value: "money", label: "Money", hint: "save toward an amount" },
  { value: "habit", label: "Habit", hint: "streaks, logged day by day: 3L water, 20 pushups" },
  { value: "book", label: "Book", hint: "chapter 7 of 20" },
];

/* ————— Schedule editor (shared by create/edit sheet and item page) ————— */

const DOW = [
  { n: 1, label: "M", name: "Monday" }, { n: 2, label: "T", name: "Tuesday" },
  { n: 3, label: "W", name: "Wednesday" }, { n: 4, label: "T", name: "Thursday" },
  { n: 5, label: "F", name: "Friday" }, { n: 6, label: "S", name: "Saturday" },
  { n: 0, label: "S", name: "Sunday" },
];

export interface ScheduleValue {
  cadence: Cadence;
  cadenceDays: number[] | null;
  cadenceCount: number | null;
}

export function ScheduleEditor({
  value, onChange, noneLabel = "No schedule",
}: { value: ScheduleValue; onChange: (v: ScheduleValue) => void; noneLabel?: string }) {
  const options: { key: string; cadence: Cadence; label: string }[] = [
    { key: "none", cadence: null, label: noneLabel },
    { key: "daily", cadence: "daily", label: "Every day" },
    { key: "weekdays", cadence: "weekdays", label: "Weekdays" },
    { key: "days", cadence: "days", label: "Specific days" },
    { key: "weekly", cadence: "weekly", label: "Times per week" },
    { key: "monthly", cadence: "monthly", label: "Monthly" },
  ];
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <Chip
            key={o.key}
            active={value.cadence === o.cadence}
            onClick={() =>
              onChange({
                cadence: o.cadence,
                cadenceDays: o.cadence === "days" ? value.cadenceDays ?? [1, 3, 5] : null,
                cadenceCount: o.cadence === "weekly" ? value.cadenceCount ?? 3 : null,
              })
            }
          >
            {o.label}
          </Chip>
        ))}
      </div>
      {value.cadence === "days" && (
        <div className="mt-3 flex gap-1.5">
          {DOW.map((d, i) => {
            const active = (value.cadenceDays ?? []).includes(d.n);
            return (
              <button
                key={i}
                type="button"
                aria-label={d.name}
                aria-pressed={active}
                onClick={() => {
                  const cur = new Set(value.cadenceDays ?? []);
                  if (active) cur.delete(d.n);
                  else cur.add(d.n);
                  onChange({ ...value, cadenceDays: [...cur] });
                }}
                className={`grid h-9 w-9 place-items-center rounded-full border text-sm font-medium transition-colors ${
                  active ? "border-accent bg-accent text-white dark:text-[#10160f]" : "border-line bg-surface text-ink-2"
                }`}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      )}
      {value.cadence === "weekly" && (
        <div className="mt-3 flex items-center gap-3">
          {[2, 3, 4, 5, 6].map((n) => (
            <Chip
              key={n}
              active={value.cadenceCount === n}
              onClick={() => onChange({ ...value, cadenceCount: n })}
            >
              {n}×
            </Chip>
          ))}
        </div>
      )}
      {value.cadence && (
        <p className="mt-2 text-xs text-ink-3">It will appear on Today automatically.</p>
      )}
    </div>
  );
}

const GRID_MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const GRID_DOW_LETTER = ["M", "T", "W", "T", "F", "S", "S"];

/** A real month calendar for picking one exact day — an appointment or a
 *  birthday, as opposed to the fuzzy week/month/quarter/year buckets. */
export function DateGridPicker({ value, onChange }: { value: string; onChange: (day: string) => void }) {
  const [manualViewMonth, setManualViewMonth] = useState<string | null>(null);
  const viewMonth = manualViewMonth ?? startOfMonth(value);

  const d = fromDay(viewMonth);
  const year = d.getFullYear();
  const monthIdx = d.getMonth();
  const gridStart = startOfWeek(viewMonth);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  return (
    <div className="rounded-xl border border-line-soft bg-surface p-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <button
          type="button"
          aria-label="Previous year"
          onClick={() => setManualViewMonth(addYears(viewMonth, -1))}
          className="pressable grid h-6 w-6 place-items-center rounded text-ink-3 hover:bg-surface-2 hover:text-ink"
        >
          ‹‹
        </button>
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => setManualViewMonth(addMonths(viewMonth, -1))}
          className="pressable grid h-6 w-6 place-items-center rounded text-ink-3 hover:bg-surface-2 hover:text-ink"
        >
          ‹
        </button>
        <span className="text-sm font-medium text-ink">{GRID_MONTH_SHORT[monthIdx]} {year}</span>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => setManualViewMonth(addMonths(viewMonth, 1))}
          className="pressable grid h-6 w-6 place-items-center rounded text-ink-3 hover:bg-surface-2 hover:text-ink"
        >
          ›
        </button>
        <button
          type="button"
          aria-label="Next year"
          onClick={() => setManualViewMonth(addYears(viewMonth, 1))}
          className="pressable grid h-6 w-6 place-items-center rounded text-ink-3 hover:bg-surface-2 hover:text-ink"
        >
          ››
        </button>
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {GRID_DOW_LETTER.map((l, i) => (
          <span key={i} className="grid h-7 place-items-center text-[10px] text-ink-3">{l}</span>
        ))}
        {cells.map((day) => {
          const inMonth = day.slice(0, 7) === viewMonth.slice(0, 7);
          const selected = day === value;
          return (
            <button
              key={day}
              type="button"
              onClick={() => {
                onChange(day);
                setManualViewMonth(null);
              }}
              className={`pressable grid h-7 place-items-center rounded-md text-xs tabular-nums transition-colors ${
                selected
                  ? "bg-accent text-white dark:text-[#10160f] font-medium"
                  : inMonth
                    ? "text-ink hover:bg-surface-2"
                    : "text-ink-3/50 hover:bg-surface-2"
              }`}
            >
              {Number(day.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The four kinds that cover most captures — shown first so the common path
 *  stays a single tap. Everything else lives behind "More". */
const COMMON_KINDS: ItemKind[] = ["goal", "habit", "project", "note"];
const MORE_KINDS: ItemKind[] = [
  "book", "dream", "idea", "quote", "milestone", "principle", "promise", "lesson", "memory",
];

const KIND_DEFAULT_TRACKER: Partial<Record<ItemKind, TrackerType>> = {
  habit: "habit",
  book: "book",
  goal: "check",
  project: "none",
  milestone: "check",
};

const PERIOD_HORIZONS: Horizon[] = ["week", "month", "quarter", "year"];
const isPeriodHorizon = (h: Horizon): h is Period => (PERIOD_HORIZONS as string[]).includes(h ?? "");

export const NOTE_HEADING_MAX = 60;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Organizing a seed into a note should keep the whole captured thought as
 *  the note's content — a long capture shouldn't get jammed whole into a
 *  single-line title and cut off. The full text always lands in the body,
 *  even a short one (so it's never "only in the heading"); the heading is
 *  just a short label pulled from the start, identical to the body when
 *  the thought was already short enough to need no trimming. */
export function deriveNoteFields(text: string): { title: string; richBody: string } {
  const trimmed = text.trim();
  const firstLine = trimmed.split("\n")[0].trim();
  const heading = firstLine.length > NOTE_HEADING_MAX
    ? `${firstLine.slice(0, NOTE_HEADING_MAX).replace(/\s+\S*$/, "").trim()}…`
    : firstLine;
  const richBody = trimmed.split("\n").map(escapeHtml).join("<br>");
  return { title: heading || "Untitled note", richBody };
}

export function ItemSheet({
  open, onClose, initial, editing, defaultAreaId, defaultParentId, defaultHorizon,
  defaultHorizonPeriod, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  /** prefill title (planting a seed) */
  initial?: string;
  /** item being edited, if any */
  editing?: Item | null;
  defaultAreaId?: string | null;
  defaultParentId?: string | null;
  /** prefill planning horizon, e.g. adding straight from a "This week" list */
  defaultHorizon?: Horizon;
  /** which specific week/month/quarter/year instance, paired with defaultHorizon */
  defaultHorizonPeriod?: string | null;
  onCreated?: (item: Item) => void;
}) {
  const { db, addItem, updateItem, limits, addArea, addLabel } = useLife();
  const [title, setTitle] = useState(editing?.title ?? initial ?? "");
  const [kind, setKind] = useState<ItemKind>(editing?.kind ?? "goal");
  const [tracker, setTracker] = useState<TrackerType>(editing?.tracker ?? "check");
  const [areaId, setAreaId] = useState<string | null>(editing?.areaId ?? defaultAreaId ?? null);
  const [horizon, setHorizon] = useState<Horizon>(editing?.horizon ?? defaultHorizon ?? null);
  const [horizonPeriod, setHorizonPeriod] = useState<string | null>(
    editing?.horizonPeriod ?? defaultHorizonPeriod ?? null
  );
  const [dateRepeatsYearly, setDateRepeatsYearly] = useState(editing?.dateRepeatsYearly ?? false);
  const [schedule, setSchedule] = useState<ScheduleValue>({
    cadence: editing?.cadence ?? null,
    cadenceDays: editing?.cadenceDays ?? null,
    cadenceCount: editing?.cadenceCount ?? null,
  });
  const [target, setTarget] = useState(editing?.target != null ? String(editing.target) : "");
  const [unit, setUnit] = useState(editing?.unit ?? "");
  const [labelIds, setLabelIds] = useState<string[]>(editing?.labels ?? []);
  const [note, setNote] = useState(editing?.note ?? "");
  const [touchedTracker, setTouchedTracker] = useState(Boolean(editing));
  const [showMore, setShowMore] = useState(Boolean(editing && MORE_KINDS.includes(editing.kind)));
  const [titleError, setTitleError] = useState(false);
  const [addingArea, setAddingArea] = useState(false);
  const [newAreaName, setNewAreaName] = useState("");
  const [addingLabel, setAddingLabel] = useState(false);
  const [newLabelName, setNewLabelName] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);

  // reset when reopened for a different subject
  const subject = `${open}:${editing?.id ?? ""}:${initial ?? ""}`;
  const [lastSubject, setLastSubject] = useState(subject);
  if (subject !== lastSubject) {
    setLastSubject(subject);
    setTitle(editing?.title ?? initial ?? "");
    setKind(editing?.kind ?? "goal");
    setTracker(editing?.tracker ?? "check");
    setAreaId(editing?.areaId ?? defaultAreaId ?? null);
    setHorizon(editing?.horizon ?? defaultHorizon ?? null);
    setHorizonPeriod(editing?.horizonPeriod ?? defaultHorizonPeriod ?? null);
    setDateRepeatsYearly(editing?.dateRepeatsYearly ?? false);
    setSchedule({
      cadence: editing?.cadence ?? null,
      cadenceDays: editing?.cadenceDays ?? null,
      cadenceCount: editing?.cadenceCount ?? null,
    });
    setTarget(editing?.target != null ? String(editing.target) : "");
    setUnit(editing?.unit ?? "");
    setLabelIds(editing?.labels ?? []);
    setNote(editing?.note ?? "");
    setTouchedTracker(Boolean(editing));
    setShowMore(Boolean(editing && MORE_KINDS.includes(editing.kind)));
    setTitleError(false);
    setAddingArea(false);
    setNewAreaName("");
    setAddingLabel(false);
    setNewLabelName("");
  }

  const createArea = () => {
    if (!newAreaName.trim() || !limits.canAddArea) return;
    const area = addArea(newAreaName, "🌿", AREA_COLORS[0].key);
    if (area) {
      setAreaId(area.id);
      setNewAreaName("");
      setAddingArea(false);
    }
  };

  const createLabel = () => {
    if (!newLabelName.trim()) return;
    const label = addLabel(newLabelName, "🏷️", AREA_COLORS[0].key);
    if (label) {
      setLabelIds((prev) => [...prev, label.id]);
      setNewLabelName("");
      setAddingLabel(false);
    }
  };

  const pickKind = (k: ItemKind) => {
    setKind(k);
    if (!touchedTracker) setTracker(KIND_DEFAULT_TRACKER[k] ?? "none");
    if (k === "habit" && !schedule.cadence) {
      setSchedule({ cadence: "daily", cadenceDays: null, cadenceCount: null });
    }
  };

  // nesting inherits no default horizon of its own, but it does bound the
  // stepper below: a weekly goal added under a monthly one only steps
  // through weeks that fall inside that month
  const parentId = editing?.parentId ?? defaultParentId ?? null;
  const parentItem = useMemo(
    () => (parentId ? db.items.find((i) => i.id === parentId) ?? null : null),
    [db.items, parentId]
  );
  const parentRange = useMemo(() => {
    if (!horizon || !isPeriodHorizon(horizon)) return null;
    if (!parentItem) return null;
    return boundingRange(horizon, parentItem.horizon, parentItem.horizonPeriod);
  }, [horizon, parentItem]);

  const pickHorizon = (h: Horizon) => {
    setHorizon(h);
    if (h && isPeriodHorizon(h)) {
      if (h === defaultHorizon && defaultHorizonPeriod) {
        setHorizonPeriod(defaultHorizonPeriod);
      } else {
        const range = parentItem ? boundingRange(h, parentItem.horizon, parentItem.horizonPeriod) : null;
        setHorizonPeriod(range ? firstAnchorWithin(range) : today());
      }
    } else if (h === "date") {
      // keep an already-picked date when re-confirming; otherwise start on
      // today's date in the calendar grid below and let the user pick
      setHorizonPeriod(editing?.horizon === "date" && editing.horizonPeriod ? editing.horizonPeriod : today());
    } else {
      setHorizonPeriod(null);
    }
  };

  const stepPrevDisabled = Boolean(
    parentRange && horizon && isPeriodHorizon(horizon) &&
    previousAnchor(horizon, horizonPeriod ?? today()) < parentRange.start
  );
  const stepNextDisabled = Boolean(
    parentRange && horizon && isPeriodHorizon(horizon) &&
    nextAnchor(horizon, horizonPeriod ?? today()) > parentRange.end
  );

  const needsTarget = ["counter", "money", "book", "percent"].includes(tracker);
  const isHabit = tracker === "habit";
  // the free-plan cap is a hard block worth disabling for; an empty title is
  // validated on submit instead, so the button is never silently inert
  const atLimit = !editing && !limits.canAddItem;

  const save = () => {
    if (atLimit) return;
    if (!title.trim()) {
      setTitleError(true);
      titleRef.current?.focus();
      return;
    }
    const t = target.trim() === "" ? (tracker === "percent" ? 100 : null) : parseFloat(target);
    // organizing a seed into a note: the captured text is content, not a
    // heading — split it so nothing long gets cut off as a single line title
    const noteSplit = !editing && kind === "note" ? deriveNoteFields(title) : null;
    const patch = {
      title: noteSplit ? noteSplit.title : title.trim(),
      kind,
      tracker,
      areaId,
      horizon,
      horizonPeriod,
      dateRepeatsYearly: horizon === "date" && dateRepeatsYearly,
      cadence: schedule.cadence,
      cadenceDays: schedule.cadence === "days" ? schedule.cadenceDays : null,
      cadenceCount: schedule.cadence === "weekly" ? schedule.cadenceCount : null,
      target: Number.isNaN(t as number) ? null : t,
      unit: unit.trim() || (tracker === "money" ? "₹" : null),
      labels: labelIds,
      note,
      ...(noteSplit ? { richBody: noteSplit.richBody } : {}),
    };
    if (editing) {
      updateItem(editing.id, patch);
    } else {
      const item = addItem({ ...patch, parentId: defaultParentId ?? null });
      if (item && onCreated) onCreated(item);
    }
    onClose();
  };

  const sortedAreas = useMemo(() => [...db.areas].sort((a, b) => a.position - b.position), [db.areas]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? "Edit" : "Give it a shape"}
      primary={{ label: editing ? "Save" : "Plant it", onClick: save }}
      primaryDisabled={atLimit}
    >
      <Field label="What is it?">
        <input
          ref={titleRef}
          className={`${inputCls} ${titleError ? "border-danger focus:border-danger" : ""}`}
          value={title}
          onChange={(e) => { setTitle(e.target.value); if (titleError) setTitleError(false); }}
          placeholder="Run a marathon"
          autoFocus={!initial}
          aria-invalid={titleError}
        />
        {titleError && (
          <p className="mt-1.5 text-xs text-danger">Give it a name first. That&apos;s the only thing it needs.</p>
        )}
      </Field>

      <Field label="It's a…">
        <div className="flex flex-wrap gap-1.5">
          {COMMON_KINDS.map((k) => (
            <Chip key={k} active={kind === k} onClick={() => pickKind(k)}>
              <KindIcon kind={k} className="mr-0.5" /> {KIND_META[k].label}
            </Chip>
          ))}
          {!showMore && (
            <Chip onClick={() => setShowMore(true)}>More…</Chip>
          )}
        </div>
        {showMore && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {MORE_KINDS.map((k) => (
              <Chip key={k} active={kind === k} onClick={() => pickKind(k)}>
                <KindIcon kind={k} className="mr-0.5" /> {KIND_META[k].label}
              </Chip>
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-ink-3">{destinationFor(kind).hint}</p>
      </Field>

      <Field label="How do you want to track it?">
        <div className="space-y-1.5">
          {TRACKER_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => { setTracker(o.value); setTouchedTracker(true); }}
              className={`w-full text-left rounded-xl border px-3.5 py-2.5 transition-colors ${
                tracker === o.value ? "border-accent bg-accent-soft" : "border-line bg-surface"
              }`}
            >
              <span className="text-sm font-medium text-ink">{o.label}</span>
              <span className="block text-xs text-ink-3">{o.hint}</span>
            </button>
          ))}
        </div>
      </Field>

      {needsTarget && (
        <div className="grid grid-cols-2 gap-3">
          <Field label={tracker === "book" ? "Chapters" : tracker === "percent" ? "Target %" : "Target"}>
            <input
              className={inputCls}
              type="number"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder={tracker === "money" ? "100000" : tracker === "book" ? "20" : "200"}
            />
          </Field>
          <Field label="Unit">
            <input
              className={inputCls}
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder={tracker === "money" ? "₹" : tracker === "book" ? "chapters" : "times"}
            />
          </Field>
        </div>
      )}

      {isHabit && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount per day">
            <input
              className={inputCls}
              type="number"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="1"
            />
          </Field>
          <Field label="Unit">
            <input
              className={inputCls}
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="glasses, km, pages…"
            />
          </Field>
        </div>
      )}

      <Field label="When does it appear?">
        <ScheduleEditor value={schedule} onChange={setSchedule} />
      </Field>

      <Field label="Planning horizon">
        <div className="flex flex-wrap gap-1.5">
          <Chip active={horizon === null} onClick={() => pickHorizon(null)}>None</Chip>
          {HORIZON_META.map((h) => (
            <Chip key={h.value} active={horizon === h.value} onClick={() => pickHorizon(h.value)}>
              {h.label}
            </Chip>
          ))}
        </div>
        {horizon && isPeriodHorizon(horizon) && (
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setHorizonPeriod(previousAnchor(horizon, horizonPeriod ?? today()))}
              disabled={stepPrevDisabled}
              aria-label={`Previous ${horizon}`}
              className="pressable grid h-8 w-8 place-items-center rounded-lg border border-line text-ink-3 hover:bg-surface-2 disabled:opacity-30 disabled:pointer-events-none"
            >
              ‹
            </button>
            <span className="flex-1 text-center text-sm font-medium text-ink">
              {prettyPeriod(horizon, horizonPeriod ?? today())}
            </span>
            <button
              type="button"
              onClick={() => setHorizonPeriod(nextAnchor(horizon, horizonPeriod ?? today()))}
              disabled={stepNextDisabled}
              aria-label={`Next ${horizon}`}
              className="pressable grid h-8 w-8 place-items-center rounded-lg border border-line text-ink-3 hover:bg-surface-2 disabled:opacity-30 disabled:pointer-events-none"
            >
              ›
            </button>
          </div>
        )}
        {parentRange && parentItem && (
          <p className="mt-1.5 text-xs text-ink-3">
            Kept inside {parentItem.title}&rsquo;s {HORIZON_META.find((h) => h.value === parentItem.horizon)?.label.toLowerCase()}.
          </p>
        )}
        {horizon === "date" && (
          <div className="mt-3 space-y-2.5">
            <DateGridPicker value={horizonPeriod ?? today()} onChange={setHorizonPeriod} />
            <div className="flex items-center justify-between">
              <p className="text-sm text-ink">
                {prettyDay(horizonPeriod ?? today())}
                {!dateRepeatsYearly && `, ${(horizonPeriod ?? today()).slice(0, 4)}`}
              </p>
              <Chip active={dateRepeatsYearly} onClick={() => setDateRepeatsYearly((v) => !v)}>
                Repeats every year
              </Chip>
            </div>
          </div>
        )}
      </Field>

      {!defaultParentId && (
        <Field label="Life area">
          <div className="flex flex-wrap gap-1.5">
            <Chip active={areaId === null} onClick={() => setAreaId(null)}>None</Chip>
            {sortedAreas.map((a) => (
              <Chip key={a.id} active={areaId === a.id} onClick={() => setAreaId(a.id)}>
                {a.emoji} {a.name}
              </Chip>
            ))}
            {!addingArea && limits.canAddArea && (
              <Chip onClick={() => setAddingArea(true)}>+ New</Chip>
            )}
          </div>
          {addingArea && (
            <div className="mt-2 flex gap-2">
              <input
                autoFocus
                className={inputCls}
                value={newAreaName}
                onChange={(e) => setNewAreaName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); createArea(); } }}
                placeholder="Health, Money, French…"
              />
              <Button small onClick={createArea} disabled={!newAreaName.trim()}>Add</Button>
            </div>
          )}
          {!limits.canAddArea && (
            <p className="mt-1.5 text-xs text-ink-3">
              Free plan is at its area limit.{" "}
              <Link href="/pricing" className="text-accent-deep font-medium">Upgrade</Link> for more.
            </p>
          )}
        </Field>
      )}

      <Field label="Labels">
        <div className="flex flex-wrap gap-1.5">
          {[...db.labels].sort((a, b) => a.position - b.position).map((l) => {
            const c = areaColor(l.color);
            const active = labelIds.includes(l.id);
            return (
              <Chip
                key={l.id}
                active={active}
                style={active ? { background: c.fg, borderColor: c.fg, color: "#fff" } : undefined}
                onClick={() =>
                  setLabelIds((prev) =>
                    prev.includes(l.id) ? prev.filter((x) => x !== l.id) : [...prev, l.id]
                  )
                }
              >
                {l.emoji} {l.name}
              </Chip>
            );
          })}
          {!addingLabel && <Chip onClick={() => setAddingLabel(true)}>+ New</Chip>}
        </div>
        {addingLabel && (
          <div className="mt-2 flex gap-2">
            <input
              autoFocus
              className={inputCls}
              value={newLabelName}
              onChange={(e) => setNewLabelName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); createLabel(); } }}
              placeholder="Rust, Family, French B2…"
            />
            <Button small onClick={createLabel} disabled={!newLabelName.trim()}>Add</Button>
          </div>
        )}
      </Field>

      <Field label="Notes">
        <textarea
          className={`${inputCls} min-h-20 resize-none`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Why does this matter to you?"
        />
      </Field>

      {atLimit && (
        <p className="text-sm text-amber mb-3">
          You&apos;ve reached the free plan&apos;s active items. Upgrade for unlimited.
        </p>
      )}
    </Sheet>
  );
}

/* ————— small helpers shared by pages ————— */

export function ProgressCaption({ item }: { item: Item }) {
  const { db } = useLife();
  const p = itemProgress(db, item);
  const own = ownProgress(item);
  if (p === null) return null;
  return (
    <span className="text-xs text-ink-3 tabular-nums">
      {Math.round(p * 100)}%{own === null ? " · from what's inside" : ""}
    </span>
  );
}
