"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useLife } from "@/lib/data/provider";
import { addDays, prettyDay, shortDay, startOfWeek, today } from "@/lib/dates";
import { areaColor } from "@/lib/palette";
import { todayEntries, TodayEntry } from "@/lib/progress";
import { Cadence, HORIZON_META } from "@/lib/types";
import { DailyJournal } from "@/components/journal";
import { HorizonList, ScheduleEditor, ScheduleValue } from "@/components/items";
import { Ring } from "@/components/progress";
import { EmptyState, Field, Sheet, inputCls } from "@/components/ui";

const DOW_LETTER = ["S", "M", "T", "W", "T", "F", "S"];

type ViewTab = "today" | "week" | "month" | "quarter" | "year";
const VIEW_TABS: { value: ViewTab; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
];

export default function TodayPage() {
  const { db, toggleEntry, deleteAction } = useLife();
  const realToday = today();
  const [day, setDay] = useState(realToday);
  const [planning, setPlanning] = useState(false);
  const [view, setView] = useState<ViewTab>("today");

  const entries = useMemo(() => todayEntries(db, day), [db, day]);
  const done = entries.filter((e) => e.action.done).length;
  const total = entries.length;
  const isToday = day === realToday;

  return (
    <div className="rise-in lg:max-w-none">
      <header className="pt-6 pb-4 flex items-start justify-between gap-4 lg:max-w-2xl">
        <div>
          <p className="text-sm text-ink-3">{view === "today" ? prettyDay(day) : "The shape of your time"}</p>
          <h1 className="font-display text-[2rem] leading-tight text-ink mt-1">
            {view === "today"
              ? isToday ? "Today" : day < realToday ? "Looking back" : "Planning ahead"
              : HORIZON_META.find((h) => h.value === view)?.label ?? view}
          </h1>
          {total > 0 && isToday && view === "today" && (
            <p className="text-sm text-ink-2 mt-2">
              {done === total
                ? "Everything done. Rest well."
                : `${total - done} small ${total - done === 1 ? "action" : "actions"} between you and a good day.`}
            </p>
          )}
        </div>
        {total > 0 && view === "today" && (
          <Ring value={done / total} size={92} stroke={8} label={`${done}/${total}`} />
        )}
      </header>

      {/* horizon switcher: today's actions, or the standing week/month/quarter/year lists */}
      <div className="mb-6 flex gap-1.5 lg:max-w-2xl">
        {VIEW_TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setView(t.value)}
            className={`pressable rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              view === t.value ? "bg-accent text-white dark:text-[#10160f]" : "bg-surface-2 text-ink-2"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {view !== "today" && (
        <div className="lg:max-w-2xl">
          <HorizonList horizon={view} />
        </div>
      )}

      {view === "today" && (
      <>
      {/* day navigation: week strip + quick jumps */}
      <div className="mb-6 lg:max-w-2xl">
        <div className="flex items-center gap-1.5">
          <NavArrow dir="prev" onClick={() => setDay(addDays(day, -7))} />
          <div className="grid flex-1 grid-cols-7 gap-1">
            {Array.from({ length: 7 }, (_, i) => {
              const d = addDays(startOfWeek(day), i);
              const active = d === day;
              const isReal = d === realToday;
              return (
                <button
                  key={d}
                  onClick={() => setDay(d)}
                  className={`pressable flex flex-col items-center rounded-xl py-1.5 text-xs transition-colors ${
                    active
                      ? "bg-accent text-white dark:text-[#10160f]"
                      : isReal
                        ? "bg-accent-soft text-accent-deep"
                        : "text-ink-3 hover:bg-surface-2"
                  }`}
                >
                  <span className="opacity-70">{DOW_LETTER[new Date(d + "T12:00:00").getDay()]}</span>
                  <span className="font-medium tabular-nums">{d.slice(8)}</span>
                </button>
              );
            })}
          </div>
          <NavArrow dir="next" onClick={() => setDay(addDays(day, 7))} />
        </div>
        <div className="mt-2 flex gap-2 text-xs">
          <DayJump label="Yesterday" onClick={() => setDay(addDays(realToday, -1))} active={day === addDays(realToday, -1)} />
          <DayJump label="Today" onClick={() => setDay(realToday)} active={isToday} />
          <DayJump label="Tomorrow" onClick={() => setDay(addDays(realToday, 1))} active={day === addDays(realToday, 1)} />
        </div>
      </div>

      {/* main: tasks left, journal right (stacked on mobile) */}
      <div className="lg:grid lg:grid-cols-[minmax(0,42rem)_minmax(18rem,24rem)] lg:items-start lg:gap-8">
        <div>
          <div className="mb-4 flex gap-2">
            <button
              onClick={() => setPlanning(true)}
              className={`${inputCls} pressable cursor-pointer text-left text-ink-3`}
            >
              {isToday ? "Add something for today…" : `Add something for ${shortDay(day)}…`}
            </button>
          </div>

          {total === 0 ? (
            <EmptyState
              emoji="🌤"
              title="A clear day"
              body="Nothing planned yet. Add one small action above, or open a goal and break off a piece."
            >
              <Link href="/life" className="text-accent-deep font-medium text-sm">
                Browse your life →
              </Link>
            </EmptyState>
          ) : (
            <div className="space-y-2">
              {entries.map((e) => (
                <ActionRow
                  key={e.action.id}
                  entry={e}
                  onToggle={() => toggleEntry(e, day)}
                  onDelete={e.virtualHabit || e.virtualItemTask ? undefined : () => deleteAction(e.action.id)}
                />
              ))}
            </div>
          )}

          {done > 0 && done === total && total > 0 && isToday && (
            <p className="mt-8 text-center font-display text-lg text-accent-deep">
              Today moved you forward. 🌱
            </p>
          )}
        </div>

        {/* the human part of the day */}
        <div className="mt-8 lg:mt-0">
          <DailyJournal date={day} />
        </div>
      </div>
      </>
      )}

      <PlanSheet open={planning} onClose={() => setPlanning(false)} day={day} />
    </div>
  );
}

function NavArrow({ dir, onClick }: { dir: "prev" | "next"; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={dir === "prev" ? "Previous week" : "Next week"}
      className="pressable grid h-8 w-6 shrink-0 place-items-center rounded-lg text-ink-3 hover:bg-surface-2"
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {dir === "prev" ? <path d="M6.5 1 2.5 5l4 4" /> : <path d="M3.5 1 7.5 5l-4 4" />}
      </svg>
    </button>
  );
}

function DayJump({ label, onClick, active }: { label: string; onClick: () => void; active: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`pressable rounded-full px-2.5 py-1 font-medium ${
        active ? "bg-surface-2 text-ink" : "text-ink-3 hover:text-ink-2"
      }`}
    >
      {label}
    </button>
  );
}

/* ————— task creation: once, or on a schedule, with priority and a note ————— */

function PlanSheet({ open, onClose, day }: { open: boolean; onClose: () => void; day: string }) {
  const { addAction, addItem } = useLife();
  const [title, setTitle] = useState("");
  const [schedule, setSchedule] = useState<ScheduleValue>({ cadence: null, cadenceDays: null, cadenceCount: null });
  const [priority, setPriority] = useState(0);
  const [note, setNote] = useState("");
  const [titleError, setTitleError] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setTitle("");
    setSchedule({ cadence: null, cadenceDays: null, cadenceCount: null });
    setPriority(0);
    setNote("");
    setTitleError(false);
  };

  const save = () => {
    if (!title.trim()) {
      setTitleError(true);
      titleRef.current?.focus();
      return;
    }
    if (schedule.cadence === null) {
      // one time
      addAction(title, day, null, 1, { priority, note });
    } else {
      // recurring: becomes a scheduled life node that feeds Today automatically
      addItem({
        title,
        kind: "habit",
        tracker: "habit",
        note,
        cadence: schedule.cadence as Cadence,
        cadenceDays: schedule.cadence === "days" ? schedule.cadenceDays : null,
        cadenceCount: schedule.cadence === "weekly" ? schedule.cadenceCount : null,
      });
    }
    reset();
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={() => { reset(); onClose(); }}
      title="Plan something"
      primary={{ label: schedule.cadence === null ? "Add" : "Create routine", onClick: save }}
    >
      <Field label="What?">
        <input
          ref={titleRef}
          className={`${inputCls} ${titleError ? "border-danger focus:border-danger" : ""}`}
          value={title}
          onChange={(e) => { setTitle(e.target.value); if (titleError) setTitleError(false); }}
          placeholder="Call someone, 20 pushups, pay bills…"
          autoFocus
          aria-invalid={titleError}
        />
        {titleError && (
          <p className="mt-1.5 text-xs text-danger">This needs a name before it can go on your day.</p>
        )}
      </Field>

      <Field label="How often?">
        <ScheduleEditor value={schedule} onChange={setSchedule} noneLabel="Just once" />
        {schedule.cadence === null && (
          <p className="mt-2 text-xs text-ink-3">One-time task for {shortDay(day)}.</p>
        )}
      </Field>

      <Field label="Priority">
        <div className="flex gap-1.5">
          <PriorityChip label="Normal" active={priority === 0} onClick={() => setPriority(0)} />
          <PriorityChip label="⭐ Important" active={priority === 1} onClick={() => setPriority(1)} />
        </div>
      </Field>

      <Field label="Small note">
        <textarea
          className={`${inputCls} min-h-16 resize-none`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Anything to remember…"
        />
      </Field>
    </Sheet>
  );
}

function PriorityChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`pressable rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
        active ? "border-accent bg-accent-soft text-accent-deep" : "border-line bg-surface text-ink-2"
      }`}
    >
      {label}
    </button>
  );
}

/* ————— a single row on the day ————— */

function ActionRow({
  entry, onToggle, onDelete,
}: { entry: TodayEntry; onToggle: () => void; onDelete?: () => void }) {
  const { db, theme } = useLife();
  const { action, item, carriedFrom, virtualHabit, virtualItemTask, dayValue, dayTarget, scheduleLabel } = entry;
  const multi = dayTarget > 1;
  const dark = theme === "dark";
  const itemLabels = item ? [...new Set(item.labels)] : [];
  return (
    <div
      className={`group flex items-center gap-3 rounded-(--radius-card) border border-line-soft bg-surface px-4 py-3 shadow-(--shadow-card) transition-opacity ${
        action.done ? "opacity-60" : ""
      }`}
    >
      <button
        onClick={onToggle}
        aria-label={
          action.done ? "Undo" : multi ? `Log one (${dayValue} of ${dayTarget})` : "Mark done"
        }
        className={`pressable relative grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition-colors ${
          action.done ? "border-accent bg-accent text-white dark:text-[#10160f]" : "border-line hover:border-accent"
        }`}
      >
        {action.done ? (
          <svg className="bloom" width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6.5 4.8 9 10 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : multi && dayValue > 0 ? (
          <svg className="absolute inset-[-2px]" width="24" height="24" viewBox="0 0 24 24">
            <circle
              cx="12" cy="12" r="10" fill="none" stroke="var(--accent)" strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 10}
              strokeDashoffset={2 * Math.PI * 10 * (1 - Math.min(1, dayValue / dayTarget))}
              transform="rotate(-90 12 12)"
            />
          </svg>
        ) : null}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {action.priority > 0 && !action.done && <span className="shrink-0 text-xs">⭐</span>}
          {item ? (
            <Link
              href={`/item/${item.id}`}
              className={`block truncate text-[0.95rem] leading-snug ${action.done ? "text-ink-3 line-through decoration-ink-3/40" : "text-ink"}`}
            >
              {action.title}
            </Link>
          ) : (
            <span className={`block truncate text-[0.95rem] leading-snug ${action.done ? "text-ink-3 line-through decoration-ink-3/40" : "text-ink"}`}>
              {action.title}
            </span>
          )}
        </div>
        <div className="flex gap-2 text-xs text-ink-3">
          {multi && (
            <span className="tabular-nums font-medium text-accent-deep">
              {Math.min(dayValue, dayTarget)}/{dayTarget}
              {item?.unit ? ` ${item.unit}` : ""}
            </span>
          )}
          {action.note && <span className="truncate">{action.note}</span>}
          {itemLabels.slice(0, 2).map((lid) => {
            const l = db.labels.find((x) => x.id === lid);
            if (!l) return null;
            const c = areaColor(l.color);
            return (
              <span
                key={lid}
                className="shrink-0 rounded-full px-1.5 py-px"
                style={{ background: dark ? c.bgDark : c.bg, color: dark ? c.fgDark : c.fg }}
              >
                {l.emoji} {l.name}
              </span>
            );
          })}
          {scheduleLabel && <span className="shrink-0">{scheduleLabel}</span>}
          {virtualHabit && !scheduleLabel && <span>habit</span>}
          {virtualItemTask && <span>🎯 today</span>}
          {carriedFrom && <span className="shrink-0 text-amber">carried from {shortDay(carriedFrom)}</span>}
        </div>
      </div>

      {onDelete && (
        <button
          onClick={onDelete}
          aria-label="Remove"
          className="text-ink-3 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity px-1"
        >
          ×
        </button>
      )}
    </div>
  );
}
