"use client";

import { ReactNode, Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLife } from "@/lib/data/provider";
import {
  addDays, isPeriod, nextAnchor, Period, periodKey, prettyDay, prettyPeriod, previousAnchor,
  shortDay, startOfWeek, today,
} from "@/lib/dates";
import { areaColor } from "@/lib/palette";
import { sortedByDone, todayEntries, TodayEntry } from "@/lib/progress";
import { Action, Cadence, HORIZON_META, Item } from "@/lib/types";
import { DailyJournal } from "@/components/journal";
import { FocusTimer } from "@/components/focustimer";
import { HorizonList, ScheduleEditor, ScheduleValue } from "@/components/items";
import { Bar } from "@/components/progress";
import { EmptyState, Field, Segmented, Sheet, inputCls } from "@/components/ui";

const DOW_LETTER = ["S", "M", "T", "W", "T", "F", "S"];

/** Narrows a ?day= query param (e.g. from the sidebar calendar) into a
 *  plausible YYYY-MM-DD, so a stray/missing query string never crashes. */
function isValidDay(v: string | null): v is string {
  return !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

type ViewTab = "today" | Period;
const VIEW_TABS: { value: ViewTab; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
];

export default function TodayPage() {
  return (
    <Suspense fallback={null}>
      <Today />
    </Suspense>
  );
}

function Today() {
  const { db, toggleEntry, deleteAction, reorderDay } = useLife();
  const params = useSearchParams();
  // arriving from Reflect's "Plan ahead" link lands on that exact period,
  // instead of always resetting to the Today tab
  const paramView = params.get("view");
  const paramDate = params.get("date");
  // the sidebar calendar jumps here with ?day=YYYY-MM-DD
  const paramDay = params.get("day");
  const realToday = today();
  const [day, setDay] = useState(isValidDay(paramDay) ? paramDay : realToday);
  const [lastParamDay, setLastParamDay] = useState(paramDay);

  // the sidebar calendar can send a new ?day= while this page is already
  // mounted — state only reads the query string once on its own, so notice
  // later changes here too
  if (paramDay !== lastParamDay) {
    setLastParamDay(paramDay);
    if (isValidDay(paramDay)) setDay(paramDay);
  }
  const [planning, setPlanning] = useState(false);
  const [editingAction, setEditingAction] = useState<Action | null>(null);
  const [editingItemTitle, setEditingItemTitle] = useState<Item | null>(null);
  const [planningHabit, setPlanningHabit] = useState<{ item: Item; date: string } | null>(null);
  const [focusingId, setFocusingId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [view, setView] = useState<ViewTab>(isPeriod(paramView) ? paramView : "today");
  const [anchors, setAnchors] = useState<Record<Period, string>>({
    week: realToday, month: realToday, quarter: realToday, year: realToday,
    ...(isPeriod(paramView) && paramDate ? { [paramView]: paramDate } : {}),
  });

  const entries = useMemo(() => todayEntries(db, day), [db, day]);
  const done = entries.filter((e) => e.action.done).length;
  const total = entries.length;
  const isToday = day === realToday;

  return (
    <div className="rise-in lg:max-w-none">
      <header className="pt-6 pb-4 lg:max-w-2xl">
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
      </header>

      {/* horizon switcher: today's actions, or the standing week/month/quarter/year lists */}
      <div className="mb-6 lg:max-w-2xl">
        <Segmented options={VIEW_TABS} value={view} onChange={setView} />
      </div>

      {view !== "today" && (
        <div className="lg:max-w-2xl">
          <PeriodNav
            period={view}
            anchor={anchors[view]}
            onChange={(a) => setAnchors((prev) => ({ ...prev, [view]: a }))}
          />
          <HorizonList period={view} anchor={anchors[view]} />
          <p className="mt-6 text-sm">
            <Link href={`/reflect?period=${view}&date=${anchors[view]}`} className="text-accent-deep font-medium">
              Reflect on this {view} →
            </Link>
          </p>
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

          {total > 0 && (
            <div className="mb-4">
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-3">Progress</p>
                <div className="flex items-center gap-2.5">
                  {reordering ? (
                    <button
                      onClick={() => setReordering(false)}
                      className="pressable text-xs font-medium text-accent-deep"
                    >
                      Done arranging
                    </button>
                  ) : (
                    <div className="relative">
                      <button
                        onClick={() => setSortMenuOpen((v) => !v)}
                        className="pressable text-xs font-medium text-ink-3 hover:text-ink-2"
                      >
                        Sort
                      </button>
                      {sortMenuOpen && (
                        <>
                          <button
                            aria-hidden
                            tabIndex={-1}
                            onClick={() => setSortMenuOpen(false)}
                            className="fixed inset-0 z-30 cursor-default"
                          />
                          <div className="absolute right-0 top-full z-40 mt-1.5 w-48 overflow-hidden rounded-xl border border-line-soft bg-surface shadow-(--shadow-float)">
                            <button
                              onClick={() => {
                                reorderDay(day, sortedByDone(entries).map((e) => e.action.id));
                                setSortMenuOpen(false);
                              }}
                              className="block w-full px-3.5 py-2.5 text-left text-sm text-ink hover:bg-surface-2"
                            >
                              Unfinished first
                            </button>
                            <button
                              onClick={() => {
                                setReordering(true);
                                setSortMenuOpen(false);
                              }}
                              className="block w-full px-3.5 py-2.5 text-left text-sm text-ink hover:bg-surface-2"
                            >
                              Custom order (drag)
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  <p className="text-xs font-semibold text-ink-3 tabular-nums">{done}/{total}</p>
                </div>
              </div>
              <Bar value={done / total} height={4} />
            </div>
          )}

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
            <TaskList
              day={day}
              reordering={reordering}
              rows={entries.map((e) => ({
                entry: e,
                onToggle: () => toggleEntry(e, day),
                onDelete: e.virtualHabit || e.virtualItemTask ? undefined : () => deleteAction(e.action.id),
                // a real action opens the full edit popup (title, priority,
                // note, delete) whether or not it's linked to a goal — the
                // link no longer takes editing away, it just adds a way in
                onEdit: e.virtualHabit || e.virtualItemTask ? undefined : () => setEditingAction(e.action),
                // habits and a goal marked "today" aren't backed by a real
                // action — their own title lives on the item, so renaming
                // opens a lighter popup that edits the item instead
                onEditItem:
                  (e.virtualHabit || e.virtualItemTask) && e.item ? () => setEditingItemTitle(e.item!) : undefined,
                onPlanDay:
                  e.virtualHabit && e.item ? () => setPlanningHabit({ item: e.item!, date: day }) : undefined,
                onFocus: () => setFocusingId(e.action.id),
              }))}
            />
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
      <EditActionSheet action={editingAction} onClose={() => setEditingAction(null)} />
      <EditItemTitleSheet item={editingItemTitle} onClose={() => setEditingItemTitle(null)} />
      <HabitDayNoteSheet planning={planningHabit} onClose={() => setPlanningHabit(null)} />
      <FocusTimer
        open={!!focusingId}
        entries={entries}
        initialEntryId={focusingId}
        onToggle={(entry) => toggleEntry(entry, day)}
        onClose={() => setFocusingId(null)}
      />
    </div>
  );
}

function NavArrow({ dir, onClick, label }: { dir: "prev" | "next"; onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label ?? (dir === "prev" ? "Previous week" : "Next week")}
      className="pressable grid h-8 w-6 shrink-0 place-items-center rounded-lg text-ink-3 hover:bg-surface-2"
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {dir === "prev" ? <path d="M6.5 1 2.5 5l4 4" /> : <path d="M3.5 1 7.5 5l-4 4" />}
      </svg>
    </button>
  );
}

/** Calendar header for the Week/Month/Quarter/Year lists — same prev/current/next
 *  shape for all four, only the label format (prettyPeriod) differs. */
function PeriodNav({
  period, anchor, onChange,
}: { period: Period; anchor: string; onChange: (anchor: string) => void }) {
  const isCurrent = periodKey(period, anchor) === periodKey(period, today());
  return (
    <div className="mb-6 flex items-center gap-1.5">
      <NavArrow dir="prev" label={`Previous ${period}`} onClick={() => onChange(previousAnchor(period, anchor))} />
      <button
        onClick={() => onChange(today())}
        className="pressable flex-1 rounded-lg py-1.5 text-center text-sm font-medium text-ink hover:bg-surface-2"
      >
        {prettyPeriod(period, anchor)}
        {!isCurrent && <span className="ml-2 text-xs font-normal text-accent-deep">jump to now</span>}
      </button>
      <NavArrow dir="next" label={`Next ${period}`} onClick={() => onChange(nextAnchor(period, anchor))} />
    </div>
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
  const [taskDate, setTaskDate] = useState(day);
  const [dateTouched, setDateTouched] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleValue>({ cadence: null, cadenceDays: null, cadenceCount: null });
  const [priority, setPriority] = useState(0);
  const [note, setNote] = useState("");
  const [titleError, setTitleError] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  // jump to whatever day is on screen each time the sheet opens fresh,
  // but leave a date the user picked mid-session alone
  if (open && !dateTouched && taskDate !== day) {
    setTaskDate(day);
  }

  const reset = () => {
    setTitle("");
    setTaskDate(day);
    setDateTouched(false);
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
      // one time — on whichever date was chosen, not necessarily today's view
      addAction(title, taskDate, null, 1, { priority, note });
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
      </Field>

      {schedule.cadence === null && (
        <Field label="On which day?">
          <input
            type="date"
            className={inputCls}
            value={taskDate}
            onChange={(e) => { if (e.target.value) { setTaskDate(e.target.value); setDateTouched(true); } }}
          />
          <p className="mt-1.5 text-xs text-ink-3">
            {taskDate === today() ? "Today" : prettyDay(taskDate)} — jump ahead to plant a task on any future day,
            like a birthday or a deadline, without paging through the day strip.
          </p>
        </Field>
      )}

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

/* ————— editing a one-time task (no linked item) ————— */

function EditActionSheet({ action, onClose }: { action: Action | null; onClose: () => void }) {
  const { updateAction, deleteAction } = useLife();
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState(0);
  const [note, setNote] = useState("");
  const [titleError, setTitleError] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  const [lastId, setLastId] = useState(action?.id ?? null);
  if (action && action.id !== lastId) {
    setLastId(action.id);
    setTitle(action.title);
    setPriority(action.priority);
    setNote(action.note);
    setTitleError(false);
    setConfirmDelete(false);
  }

  const close = () => { onClose(); setConfirmDelete(false); };

  const save = () => {
    if (!action) return;
    if (!title.trim()) {
      setTitleError(true);
      titleRef.current?.focus();
      return;
    }
    updateAction(action.id, { title: title.trim(), priority, note });
    close();
  };

  return (
    <Sheet
      open={!!action}
      onClose={close}
      title="Edit task"
      primary={{ label: "Save", onClick: save }}
    >
      <Field label="What?">
        <input
          ref={titleRef}
          className={`${inputCls} ${titleError ? "border-danger focus:border-danger" : ""}`}
          value={title}
          onChange={(e) => { setTitle(e.target.value); if (titleError) setTitleError(false); }}
          autoFocus
          aria-invalid={titleError}
        />
        {titleError && (
          <p className="mt-1.5 text-xs text-danger">This needs a name before it can go on your day.</p>
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

      <div className="pt-2">
        {confirmDelete ? (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-ink-2">Remove this task?</span>
            <button
              className="font-medium text-danger"
              onClick={() => { if (action) deleteAction(action.id); close(); }}
            >
              Delete
            </button>
            <button className="text-ink-3" onClick={() => setConfirmDelete(false)}>Keep</button>
          </div>
        ) : (
          <button className="text-sm font-medium text-danger" onClick={() => setConfirmDelete(true)}>
            Delete task
          </button>
        )}
      </div>
    </Sheet>
  );
}

/* ————— renaming a habit or a goal marked "today" — these live on the item
 *  itself, not a real action row, so it's a lighter popup than EditActionSheet ————— */

function EditItemTitleSheet({ item, onClose }: { item: Item | null; onClose: () => void }) {
  const { updateItem } = useLife();
  const [title, setTitle] = useState("");
  const [titleError, setTitleError] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  const [lastId, setLastId] = useState(item?.id ?? null);
  if (item && item.id !== lastId) {
    setLastId(item.id);
    setTitle(item.title);
    setTitleError(false);
  }

  const save = () => {
    if (!item) return;
    if (!title.trim()) {
      setTitleError(true);
      titleRef.current?.focus();
      return;
    }
    updateItem(item.id, { title: title.trim() });
    onClose();
  };

  return (
    <Sheet
      open={!!item}
      onClose={onClose}
      title="Rename"
      primary={{ label: "Save", onClick: save }}
    >
      <Field label="What?">
        <input
          ref={titleRef}
          className={`${inputCls} ${titleError ? "border-danger focus:border-danger" : ""}`}
          value={title}
          onChange={(e) => { setTitle(e.target.value); if (titleError) setTitleError(false); }}
          autoFocus
          aria-invalid={titleError}
        />
        {titleError && (
          <p className="mt-1.5 text-xs text-danger">This needs a name.</p>
        )}
      </Field>
    </Sheet>
  );
}

/* ————— planning what a habit means on a specific day ————— */

function HabitDayNoteSheet({
  planning, onClose,
}: { planning: { item: Item; date: string } | null; onClose: () => void }) {
  const { db, setHabitDayNote } = useLife();
  const [date, setDate] = useState("");
  const [text, setText] = useState("");
  const [lastKey, setLastKey] = useState<string | null>(null);

  const key = planning ? `${planning.item.id}:${planning.date}` : null;
  if (planning && key !== lastKey) {
    setLastKey(key);
    setDate(planning.date);
    const existing = db.habitDayNotes.find((n) => n.itemId === planning.item.id && n.date === planning.date);
    setText(existing?.text ?? "");
  }

  const changeDate = (d: string) => {
    setDate(d);
    if (!planning) return;
    const existing = db.habitDayNotes.find((n) => n.itemId === planning.item.id && n.date === d);
    setText(existing?.text ?? "");
  };

  const save = () => {
    if (!planning) return;
    setHabitDayNote(planning.item.id, date, text);
    onClose();
  };

  return (
    <Sheet
      open={!!planning}
      onClose={onClose}
      title={planning ? `Plan "${planning.item.title}"` : "Plan"}
      primary={{ label: "Save", onClick: save }}
    >
      <Field label="Which day?">
        <input
          type="date"
          className={inputCls}
          value={date}
          onChange={(e) => e.target.value && changeDate(e.target.value)}
        />
      </Field>
      <Field label="What does this day mean?">
        <input
          className={inputCls}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="clean desk, side desk, top drawer…"
          autoFocus
        />
        <p className="mt-1.5 text-xs text-ink-3">
          Leave blank to just show &ldquo;{planning?.item.title}&rdquo; on this day.
        </p>
      </Field>
    </Sheet>
  );
}

/* ————— the day's list: freely draggable, completion never moves a row ————— */

interface TaskRowConfig {
  entry: TodayEntry;
  onToggle: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  onEditItem?: () => void;
  onPlanDay?: () => void;
  onFocus?: () => void;
}

// matches the list's own space-y-2 gap, so the drag math lines up with the
// actual pixel gap between rows
const ROW_GAP = 8;

function TaskList({ rows, day, reordering }: { rows: TaskRowConfig[]; day: string; reordering: boolean }) {
  const { reorderDay } = useLife();
  const byId = useMemo(() => new Map(rows.map((r) => [r.entry.action.id, r] as const)), [rows]);
  const baseOrder = useMemo(() => rows.map((r) => r.entry.action.id), [rows]);

  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const rowEls = useRef<Map<string, HTMLDivElement>>(new Map());
  const startClientY = useRef(0);
  const orderRef = useRef<string[]>(baseOrder);

  const order = dragOrder ?? baseOrder;

  const beginDrag = (id: string, clientY: number) => {
    orderRef.current = order;
    startClientY.current = clientY;
    setDragOrder(order);
    setDraggingId(id);
  };

  // as the dragged row's live (transformed) center crosses a neighbor's
  // midpoint, swap places with it and rebase the pointer offset by that
  // neighbor's height so the row keeps following the pointer with no jump
  const moveDrag = (id: string, clientY: number) => {
    const el = rowEls.current.get(id);
    if (!el) return;
    el.style.transform = `translateY(${clientY - startClientY.current}px)`;

    const current = orderRef.current;
    const idx = current.indexOf(id);
    const draggedRect = el.getBoundingClientRect();
    const draggedCenter = draggedRect.top + draggedRect.height / 2;

    if (idx < current.length - 1) {
      const nextId = current[idx + 1];
      const nextEl = rowEls.current.get(nextId);
      if (nextEl) {
        const r = nextEl.getBoundingClientRect();
        if (draggedCenter > r.top + r.height / 2) {
          const next = [...current];
          next[idx] = nextId;
          next[idx + 1] = id;
          orderRef.current = next;
          setDragOrder(next);
          startClientY.current += r.height + ROW_GAP;
          return;
        }
      }
    }
    if (idx > 0) {
      const prevId = current[idx - 1];
      const prevEl = rowEls.current.get(prevId);
      if (prevEl) {
        const r = prevEl.getBoundingClientRect();
        if (draggedCenter < r.top + r.height / 2) {
          const next = [...current];
          next[idx] = prevId;
          next[idx - 1] = id;
          orderRef.current = next;
          setDragOrder(next);
          startClientY.current -= r.height + ROW_GAP;
        }
      }
    }
  };

  const endDrag = (id: string) => {
    const el = rowEls.current.get(id);
    if (el) el.style.transform = "";
    setDraggingId(null);
    setDragOrder(null);
    reorderDay(day, orderRef.current);
  };

  // safety net: a touch that grazes the handle mid-scroll can start a drag
  // whose pointerup/pointercancel never reaches us (the gesture turns into
  // a page scroll instead). Whenever no drag is in flight, make sure no row
  // is left stuck with a stray transform — otherwise it renders in the
  // wrong spot forever, showing as a gap where it should be and an overlap
  // where the leftover transform put it.
  useEffect(() => {
    if (draggingId) return;
    rowEls.current.forEach((el) => { el.style.transform = ""; });
  }, [draggingId, rows]);

  return (
    <div className="space-y-2">
      {order.map((id) => {
        const row = byId.get(id);
        if (!row) return null;
        const dragging = draggingId === id;
        return (
          <div
            key={id}
            ref={(el) => {
              if (el) rowEls.current.set(id, el);
              else rowEls.current.delete(id);
            }}
            className={`relative ${dragging ? "z-20" : ""}`}
          >
            <ActionRow
              entry={row.entry}
              onToggle={row.onToggle}
              onDelete={row.onDelete}
              onEdit={row.onEdit}
              onEditItem={row.onEditItem}
              onPlanDay={row.onPlanDay}
              onFocus={row.onFocus}
              dragHandle={
                reordering ? (
                  <button
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture(e.pointerId);
                      beginDrag(id, e.clientY);
                    }}
                    onPointerMove={(e) => draggingId === id && moveDrag(id, e.clientY)}
                    onPointerUp={() => draggingId === id && endDrag(id)}
                    onPointerCancel={() => draggingId === id && endDrag(id)}
                    onLostPointerCapture={() => draggingId === id && endDrag(id)}
                    aria-label="Drag to reorder"
                    className="shrink-0 touch-none cursor-grab px-1 text-ink-3 active:cursor-grabbing"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                      <circle cx="4" cy="3" r="1.3" /><circle cx="10" cy="3" r="1.3" />
                      <circle cx="4" cy="7" r="1.3" /><circle cx="10" cy="7" r="1.3" />
                      <circle cx="4" cy="11" r="1.3" /><circle cx="10" cy="11" r="1.3" />
                    </svg>
                  </button>
                ) : undefined
              }
            />
          </div>
        );
      })}
    </div>
  );
}

/* ————— a single row on the day ————— */

function ActionRow({
  entry, onToggle, onDelete, onEdit, onEditItem, onPlanDay, onFocus, dragHandle,
}: {
  entry: TodayEntry;
  onToggle: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  onEditItem?: () => void;
  onPlanDay?: () => void;
  onFocus?: () => void;
  dragHandle?: ReactNode;
}) {
  const { db, theme } = useLife();
  const {
    action, item, carriedFrom, completedOn, virtualHabit, virtualItemTask, dayValue, dayTarget, scheduleLabel,
  } = entry;
  const multi = dayTarget > 1;
  const dark = theme === "dark";
  const itemLabels = item ? [...new Set(item.labels)] : [];
  // a habit's day-specific plan ("clean desk") is what you actually came to
  // do, so it leads; the habit's own name ("clean") becomes context beneath
  const dayPlanned = virtualHabit && !!action.note;
  const mainText = dayPlanned ? action.note : action.title;

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
        className={`pressable relative grid h-6 w-6 shrink-0 place-items-center rounded-lg border-2 transition-colors ${
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
          {/* click the task itself to toggle it done, same as the checkbox —
              editing and opening the linked goal each got their own small
              icon instead, so this stays a single, unambiguous action */}
          <span
            onClick={onToggle}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onToggle();
              }
            }}
            className={`block min-w-0 cursor-pointer whitespace-normal break-words text-[0.95rem] leading-snug ${action.done ? "text-ink-3 line-through decoration-ink-3/40" : "text-ink"}`}
          >
            {mainText}
          </span>
        </div>
        {dayPlanned && (
          <p className="mt-0.5 text-xs text-ink-3">{action.title}</p>
        )}
        <div className="flex gap-2 text-xs text-ink-3">
          {multi && (
            <span className="tabular-nums font-medium text-accent-deep">
              {Math.min(dayValue, dayTarget)}/{dayTarget}
              {item?.unit ? ` ${item.unit}` : ""}
            </span>
          )}
          {!dayPlanned && action.note && <span className="truncate">{action.note}</span>}
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
          {completedOn && <span className="shrink-0 text-accent-deep">done {shortDay(completedOn)}</span>}
        </div>
      </div>

      {item && (
        <Link
          href={`/item/${item.id}`}
          aria-label={`Open "${item.title}"`}
          className="shrink-0 text-ink-3 hover:text-ink px-1"
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
            <path d="M8 5H5.5A1.5 1.5 0 0 0 4 6.5v8A1.5 1.5 0 0 0 5.5 16h8a1.5 1.5 0 0 0 1.5-1.5V12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M11 4h5v5M15.5 4.5 9.5 10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      )}

      {onPlanDay && (
        <button
          onClick={onPlanDay}
          aria-label="Plan what this day means"
          className="shrink-0 text-ink-3 hover:text-ink px-1"
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
            <rect x="3.5" y="4.5" width="13" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M3.5 8h13M7 3v3M13 3v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      )}

      {(onEdit || onEditItem) && (
        <button
          onClick={onEdit ?? onEditItem}
          aria-label="Edit this task"
          className="shrink-0 text-ink-3 hover:text-ink px-1"
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
            <path d="M14.5 3.5 16.5 5.5 6 16H4v-2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      {onFocus && !action.done && (
        <button
          onClick={onFocus}
          aria-label="Focus on this with a timer"
          className="shrink-0 text-ink-3 hover:text-ink px-1"
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M10 6v4l2.8 1.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      {/* always rendered, even when nothing can be removed here — so the
          icon row's width (and everything to its left) lines up the same
          across every row instead of shifting by one icon's width */}
      <button
        onClick={onDelete}
        disabled={!onDelete}
        aria-label="Remove"
        aria-hidden={!onDelete}
        tabIndex={onDelete ? 0 : -1}
        className={`shrink-0 px-1 transition-opacity ${
          onDelete ? "text-ink-3 opacity-0 group-hover:opacity-100 focus:opacity-100" : "invisible"
        }`}
      >
        ×
      </button>

      {dragHandle}
    </div>
  );
}
