"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLife } from "@/lib/data/provider";
import {
  currentStreak, dayLogged, habitDays, routineDoneSteps, routineLogDay, routineMinutes,
  routineWindowLabel,
} from "@/lib/progress";
import { Item, RoutineStep } from "@/lib/types";
import { shortDay, today } from "@/lib/dates";
import { uid } from "@/lib/uid";
import { BackLink, Button, Chip, EmptyState, Field, Sheet, inputCls } from "@/components/ui";

/* One tap plants a whole starter script — edit anything afterwards. */
const TEMPLATES: {
  title: string;
  emoji: string;
  window: [string, string];
  steps: [string, number | null][];
}[] = [
  {
    title: "Morning routine",
    emoji: "🌄",
    window: ["05:00", "12:00"],
    steps: [["Wash face", 5], ["Meditation", 15], ["Brush teeth", 5]],
  },
  {
    title: "Night routine",
    emoji: "🌙",
    window: ["21:00", "02:00"],
    steps: [["Dinner", 30], ["Meds", null], ["Brush teeth", 5], ["Close the day's loops", 20], ["Read a book", 20]],
  },
];

export default function RoutinesPage() {
  const { db, addItem } = useLife();
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  const routines = useMemo(
    () =>
      db.items
        .filter((i) => i.kind === "routine" && i.status === "active")
        .sort((a, b) => a.position - b.position),
    [db.items]
  );

  const plantTemplate = (t: (typeof TEMPLATES)[number]) => {
    const item = addItem({
      title: t.title,
      kind: "routine",
      tracker: "habit",
      windowStart: t.window[0],
      windowEnd: t.window[1],
      steps: t.steps.map(([title, minutes]): RoutineStep => ({ id: uid(), title, minutes })),
    });
    if (item) router.push(`/item/${item.id}`);
  };

  return (
    <div className="rise-in max-w-2xl">
      <BackLink fallback="/today" label="Today" />
      <header className="pt-2 pb-4">
        <p className="text-sm text-ink-3">The parts of the day that run on rails</p>
        <h1 className="font-display text-[2rem] leading-tight text-ink mt-1">Routines</h1>
      </header>

      <p className="mb-6 text-sm leading-relaxed text-ink-2">
        A routine is a timetable: an ordered list of steps you set up once — each with
        its minutes, if you want them — that shows up as <em>one</em> line on Today
        during its hours. Tick steps here or walk them with the step timer; ticking the
        last one logs the day and feeds the streak.
      </p>

      <div className="mb-4">
        <Button small onClick={() => setCreating(true)}>+ New routine</Button>
      </div>

      {routines.length === 0 ? (
        <EmptyState
          emoji="🌄"
          title="No routines yet"
          body="Start from a template — everything about it stays editable — or build your own."
        >
          <div className="flex flex-wrap justify-center gap-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.title}
                onClick={() => plantTemplate(t)}
                className="pressable rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm text-ink-2"
              >
                {t.emoji} {t.title} · {t.steps.length} steps
              </button>
            ))}
          </div>
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {routines.map((r) => (
            <RoutineCard key={r.id} item={r} />
          ))}
        </div>
      )}

      <CreateRoutineSheet open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function RoutineCard({ item }: { item: Item }) {
  const { db, setRoutineStepDone, toggleHabitDay } = useLife();
  // before ~4 am a wrapped-window routine still ticks against yesterday
  const day = routineLogDay(item);
  const steps = item.steps ?? [];
  const ticked = routineDoneSteps(db, item.id, day);
  const doneToday = dayLogged(db.logs, item.id, day) > 0;
  const streak = currentStreak(habitDays(db.logs, item.id));
  const total = routineMinutes(item);
  const windowLabel = routineWindowLabel(item);

  return (
    <div className="rounded-(--radius-card) border border-line-soft bg-surface p-4 shadow-(--shadow-card)">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/item/${item.id}`} className="font-display text-lg text-ink hover:text-accent-deep">
            {item.title}
          </Link>
          <p className="mt-0.5 text-xs text-ink-3">
            {windowLabel ?? "all day"}
            {steps.length > 0 && ` · ${steps.length} step${steps.length === 1 ? "" : "s"}`}
            {total != null && ` · ${total} min`}
            {streak > 1 && ` · ${streak}-day streak`}
          </p>
          {day !== today() && (
            <p className="mt-0.5 text-xs text-accent-deep">
              🌙 ticking the night of {shortDay(day)} until 4 am
            </p>
          )}
        </div>
        {doneToday ? (
          <button
            onClick={() => toggleHabitDay(item, day, true)}
            className="pressable shrink-0 rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent-deep"
            title="Done today — tap to undo"
          >
            ✓ done today
          </button>
        ) : (
          <Link
            href={`/today?view=today&day=${today()}&focus=${encodeURIComponent(`habit:${item.id}:${day}`)}`}
            className="pressable shrink-0 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink-2 hover:border-accent"
          >
            ▶ Run
          </Link>
        )}
      </div>

      {steps.length > 0 && (
        <div className="mt-3 space-y-1">
          {steps.map((s, i) => {
            const on = ticked.has(s.id);
            return (
              <div key={s.id} className="flex items-center gap-2.5 text-sm">
                <button
                  onClick={() => setRoutineStepDone(item, day, s.id, !on)}
                  aria-label={on ? `Untick "${s.title}"` : `Tick "${s.title}" for today`}
                  className={`pressable grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition-colors ${
                    on ? "border-accent bg-accent text-white dark:text-[#10160f]" : "border-line hover:border-accent"
                  }`}
                >
                  {on && (
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6.5 4.8 9 10 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
                <span className={`min-w-0 truncate ${on ? "text-ink-3 line-through decoration-ink-3/40" : "text-ink-2"}`}>
                  {i + 1}. {s.title}
                </span>
                <span className="ml-auto shrink-0 text-xs text-ink-3 tabular-nums">
                  {s.minutes != null ? `${s.minutes} min` : "–"}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {steps.length === 0 && (
        <p className="mt-2 text-xs text-ink-3">
          No steps yet — <Link href={`/item/${item.id}`} className="text-accent-deep font-medium">open it</Link> and
          write its script.
        </p>
      )}
    </div>
  );
}

/* ————— creating one: name it, give it hours, then write its script ————— */

const CREATE_PRESETS: { label: string; start: string | null; end: string | null }[] = [
  { label: "🌄 Morning", start: "05:00", end: "12:00" },
  { label: "🌤 Afternoon", start: "12:00", end: "17:00" },
  { label: "🌙 Night", start: "21:00", end: "02:00" },
  { label: "All day", start: null, end: null },
];

function CreateRoutineSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, addItem } = useLife();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [areaId, setAreaId] = useState<string | null>(null);
  const sortedAreas = useMemo(() => [...db.areas].sort((a, b) => a.position - b.position), [db.areas]);

  const save = () => {
    if (!title.trim()) return;
    const item = addItem({
      title, kind: "routine", tracker: "habit", areaId,
      windowStart: start, windowEnd: end,
    });
    onClose();
    setTitle("");
    if (item) router.push(`/item/${item.id}`);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New routine"
      primary={{ label: "Create — then add steps", onClick: save }}
      primaryDisabled={!title.trim()}
    >
      <Field label="Name it">
        <input
          className={inputCls}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Morning, Gym, Study, Beauty…"
          autoFocus
        />
      </Field>

      <Field label="When should it sit on Today?">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {CREATE_PRESETS.map((p) => (
            <Chip
              key={p.label}
              active={start === p.start && end === p.end}
              onClick={() => { setStart(p.start); setEnd(p.end); }}
            >
              {p.label}
            </Chip>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="time"
            value={start ?? ""}
            onChange={(e) => setStart(e.target.value || null)}
            aria-label="Visible from"
            className="rounded-lg border border-line bg-bg px-2 py-1.5 text-sm text-ink tabular-nums outline-none focus:border-accent"
          />
          <span className="text-sm text-ink-3">to</span>
          <input
            type="time"
            value={end ?? ""}
            onChange={(e) => setEnd(e.target.value || null)}
            aria-label="Visible until"
            className="rounded-lg border border-line bg-bg px-2 py-1.5 text-sm text-ink tabular-nums outline-none focus:border-accent"
          />
        </div>
        <p className="mt-1.5 text-xs text-ink-3">
          Past midnight is fine — 9:00 pm to 2:00 am. Empty means all day.
        </p>
      </Field>

      {sortedAreas.length > 0 && (
        <Field label="Which part of life is this for?">
          <div className="flex flex-wrap gap-1.5">
            <Chip active={areaId === null} onClick={() => setAreaId(null)}>None</Chip>
            {sortedAreas.map((a) => (
              <Chip key={a.id} active={areaId === a.id} onClick={() => setAreaId(a.id)}>
                {a.emoji} {a.name}
              </Chip>
            ))}
          </div>
        </Field>
      )}
    </Sheet>
  );
}
