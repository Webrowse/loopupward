"use client";

import { useEffect, useRef, useState } from "react";
import { useLife } from "@/lib/data/provider";
import { routineDoneSteps, routineMinutes, TodayEntry } from "@/lib/progress";
import { Item, RoutineStep } from "@/lib/types";
import { Button, Chip, Field, Sheet, inputCls } from "@/components/ui";

const PRESETS = [5, 10, 15, 25, 45];

function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch {
    // no audio available — the visual flash still lands
  }
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

/**
 * Runs `tick` once a second while `active` — and again the instant the tab
 * becomes visible. Browsers throttle background-tab intervals to a crawl
 * (Chrome eventually fires them about once a minute), so no clock in here
 * may ever COUNT ticks: every tick recomputes from Date.now() against a
 * stored deadline, and this hook only decides when to look at the clock.
 * Twenty minutes in another workspace then costs one glance to catch up.
 */
function useWallClock(active: boolean, tick: () => void) {
  const tickRef = useRef(tick);
  useEffect(() => {
    tickRef.current = tick;
  });
  useEffect(() => {
    if (!active) return;
    const run = () => tickRef.current();
    run();
    const id = setInterval(run, 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [active]);
}

/** Green at the start of the countdown, sliding toward red as the deadline
 *  nears. `fraction` is time remaining / total (1 = just started, 0 = up). */
function ringColor(fraction: number): string {
  const from = [61, 122, 80]; // accent green
  const to = [180, 84, 62]; // danger red-brown
  const t = 1 - Math.max(0, Math.min(1, fraction));
  const rgb = from.map((c, i) => Math.round(c + (to[i] - c) * t));
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

const RING_SIZE = 300;
const RING_STROKE = 10;

/** A habit's day-specific plan ("clean desk") is what you actually came to
 *  do, so it leads; the habit's own name ("clean") becomes context beneath.
 *  Otherwise the title leads and a note, if any, is just a small aside. */
function entryText(entry: TodayEntry): { title: string; subtitle?: string } {
  const dayPlanned = entry.virtualHabit && !!entry.action.note;
  return {
    title: dayPlanned ? entry.action.note : entry.action.title,
    subtitle: dayPlanned ? entry.action.title : entry.action.note || undefined,
  };
}

/**
 * A full-screen, single-purpose focus mode: pick a length, then nothing on
 * screen but the task, a big checkbox and a countdown until it ends. No
 * pause — the point is one task and no fiddling until time's up or you quit.
 * The ring around the countdown depletes and shifts from green to red as
 * time runs out; past zero it holds empty while a small count-up beside the
 * frozen 00:00 tracks how far into overtime the task ran.
 *
 * Finishing one task doesn't drop you back to the Today list — it offers
 * whatever's still undone so a chain of focus sessions can run back to back
 * without ever leaving this screen.
 */
export function FocusTimer({
  open, entries, initialEntryId, autoRun = false, onToggle, onClose,
}: {
  open: boolean;
  entries: TodayEntry[];
  initialEntryId: string | null;
  /** open a routine straight into its step runner, skipping the setup sheet */
  autoRun?: boolean;
  onToggle: (entry: TodayEntry) => void;
  onClose: () => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(initialEntryId);
  const [minutes, setMinutes] = useState(25);
  const [running, setRunning] = useState(false);
  // a routine doesn't run as one block of minutes — it walks its script
  // step by step, so Start hands over to the step runner instead
  const [runningRoutine, setRunningRoutine] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [finished, setFinished] = useState(false);
  const [overtime, setOvertime] = useState(0);
  // the moment the countdown ends, as wall time — remaining/overtime are
  // recomputed from this, never counted down (see useWallClock)
  const [endAt, setEndAt] = useState<number | null>(null);
  // when paused, the wall-time instant we froze at — on resume the deadline is
  // pushed out by exactly how long we sat paused, so the clock never advances
  // while stopped (it's derived from endAt, not counted)
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const paused = pausedAt !== null;
  const beepedRef = useRef(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const [pickingNext, setPickingNext] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);

  // a routine knows how long it should take — the sum of its steps' minutes
  // arrives as the suggested length instead of the generic default
  const suggestedFor = (entryId: string | null): number => {
    const e = entryId ? entries.find((x) => x.action.id === entryId) : null;
    const total = e?.item && e.item.kind === "routine" ? routineMinutes(e.item) : null;
    return total != null ? Math.max(1, Math.min(480, Math.round(total))) : 25;
  };

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      // freshly opened — pick up whichever row was tapped. ▶ Run hands a
      // routine directly to the step runner (harmless for anything else:
      // only routine entries ever render the runner).
      setActiveId(initialEntryId);
      setMinutes(suggestedFor(initialEntryId));
      setPickingNext(false);
      setRunning(false);
      setRunningRoutine(autoRun);
      setFinished(false);
      setOvertime(0);
      setJustCompleted(false);
      setPausedAt(null);
    } else {
      setRunning(false);
      setRunningRoutine(false);
      setFinished(false);
      setMinutes(25);
      setOvertime(0);
      setJustCompleted(false);
      setPickingNext(false);
      setActiveId(null);
      setPausedAt(null);
    }
  }

  const current = entries.find((e) => e.action.id === activeId) ?? null;

  // the countdown holds at 00:00 once the deadline passes; overtime counts
  // up from that same deadline — both read from the wall clock
  useWallClock(running && !paused && endAt != null, () => {
    if (endAt == null) return;
    const left = Math.round((endAt - Date.now()) / 1000);
    if (left > 0) {
      setRemaining(left);
      return;
    }
    setRemaining(0);
    setOvertime(-left);
    if (!beepedRef.current) {
      beepedRef.current = true;
      setFinished(true);
      beep();
    }
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const start = () => {
    beepedRef.current = false;
    setEndAt(Date.now() + minutes * 60_000);
    setRemaining(minutes * 60);
    setFinished(false);
    setOvertime(0);
    setPausedAt(null);
    setRunning(true);
  };

  // freeze the clock exactly where it stands, or push the deadline out by the
  // time spent paused and let it run on — countdown and overtime both survive
  const togglePause = () => {
    if (endAt == null) return;
    if (pausedAt == null) {
      const now = Date.now();
      const left = Math.round((endAt - now) / 1000);
      if (left > 0) setRemaining(left);
      else { setRemaining(0); setOvertime(-left); }
      setPausedAt(now);
    } else {
      setEndAt(endAt + (Date.now() - pausedAt));
      setPausedAt(null);
    }
  };

  const pickNext = (entry: TodayEntry) => {
    setActiveId(entry.action.id);
    setMinutes(suggestedFor(entry.action.id));
    setPickingNext(false);
    setRunning(false);
    setRunningRoutine(false);
    setFinished(false);
    setOvertime(0);
    setJustCompleted(false);
    setPausedAt(null);
  };

  // marking a carried-over task done drops it out of `entries` entirely (it
  // only ever shows up there while still undone), so `current` can go null
  // the moment that happens — this screen must not depend on it still
  // resolving, or the whole timer silently unmounts back to the Today page
  if (pickingNext) {
    const undone = entries.filter((e) => !e.action.done);
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-bg px-6 py-10 text-center">
        <div>
          <p className="text-lg text-accent-deep font-medium mb-1">Nice work. 🌱</p>
          <h1 className="font-display text-[1.75rem] sm:text-[2rem] leading-tight text-ink">
            {undone.length > 0 ? "What's next?" : "Everything's done"}
          </h1>
        </div>

        {undone.length > 0 ? (
          <div className="w-full max-w-sm space-y-2 overflow-y-auto" style={{ maxHeight: "50vh" }}>
            {undone.map((e) => (
              <button
                key={e.action.id}
                onClick={() => pickNext(e)}
                className="pressable block w-full rounded-(--radius-card) border border-line-soft bg-surface px-4 py-3 text-left text-[0.95rem] text-ink shadow-(--shadow-card) hover:border-accent"
              >
                {entryText(e).title}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-3 max-w-xs">Nothing left on today&rsquo;s list.</p>
        )}

        <button onClick={onClose} className="pressable text-sm font-medium text-ink-3 hover:text-ink px-4 py-2">
          Later
        </button>
      </div>
    );
  }

  // everything below is the setup sheet and the running countdown — both
  // need a real current entry to show
  if (!current) return null;

  const check = () => {
    const completing = !current.action.done;
    onToggle(current);
    if (completing) {
      // let the pop, the check stroke, and the ring pulse actually play
      // before offering what's next — that pause is the whole point
      setJustCompleted(true);
      setTimeout(() => {
        setJustCompleted(false);
        setRunning(false);
        setPickingNext(true);
      }, 900);
    } else {
      setJustCompleted(false);
      setTimeout(onClose, 300);
    }
  };

  const { title, subtitle } = entryText(current);
  const steps = current.item?.kind === "routine" ? current.item.steps ?? [] : [];
  const routineTotal = current.item ? routineMinutes(current.item) : null;
  const isRoutine = steps.length > 0 && !!current.item;

  // a routine runs step by step: its own screen, its own rules — against
  // the day its row stands for (a night routine at 1 am means yesterday)
  if (isRoutine && runningRoutine && current.item) {
    return (
      <RoutineRun
        item={current.item}
        day={current.action.date}
        onFinished={() => {
          setRunningRoutine(false);
          setPickingNext(true);
        }}
        onClose={onClose}
      />
    );
  }

  if (!running) {
    return (
      <Sheet
        open={open}
        onClose={onClose}
        title="Focus on this"
        primary={{
          label: isRoutine ? "Start the routine" : "Start",
          onClick: isRoutine ? () => setRunningRoutine(true) : start,
        }}
      >
        <p className="text-sm text-ink-2 leading-relaxed mb-1">&ldquo;{title}&rdquo;</p>
        {steps.length > 0 && (
          <div className="mb-3 rounded-xl border border-line-soft bg-surface-2/50 px-3.5 py-2.5">
            {steps.map((s, i) => (
              <div key={s.id} className="flex items-baseline justify-between gap-3 py-0.5 text-sm">
                <span className="min-w-0 truncate text-ink-2">{i + 1}. {s.title}</span>
                <span className="shrink-0 text-xs text-ink-3 tabular-nums">
                  {s.minutes != null ? `${s.minutes} min` : "no timer"}
                </span>
              </div>
            ))}
            {routineTotal != null && (
              <p className="mt-1.5 border-t border-line-soft pt-1.5 text-right text-xs font-medium text-accent-deep tabular-nums">
                {routineTotal} min all together
              </p>
            )}
          </div>
        )}
        {isRoutine ? (
          <p className="text-xs leading-relaxed text-ink-3">
            One step at a time, in order. Each timed step starts its own countdown;
            finishing one rolls straight into the next, and anything you skip comes
            back around at the end.
          </p>
        ) : (
          <Field label="How many minutes?">
            <div className="flex flex-wrap gap-1.5 mb-2">
              {PRESETS.map((m) => (
                <Chip key={m} active={minutes === m} onClick={() => setMinutes(m)}>
                  {m}
                </Chip>
              ))}
            </div>
            <input
              type="number"
              min={1}
              max={480}
              className={inputCls}
              value={minutes}
              onChange={(e) => setMinutes(Math.max(1, Math.min(480, Number(e.target.value) || 1)))}
            />
          </Field>
        )}
      </Sheet>
    );
  }

  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;
  const omm = Math.floor(overtime / 60);
  const oss = overtime % 60;

  const totalSeconds = minutes * 60;
  const fraction = totalSeconds > 0 ? remaining / totalSeconds : 0;
  const r = (RING_SIZE - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * r;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-8 bg-bg px-6 py-10 text-center">
      <div>
        {subtitle && <p className="text-lg text-ink-3 mb-1">{subtitle}</p>}
        <h1 className="font-display text-[2rem] sm:text-[2.75rem] leading-tight text-ink max-w-3xl">
          {title}
        </h1>
        {steps.length > 0 && (
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-3">
            {steps.map((s) => `${s.title}${s.minutes != null ? ` ${s.minutes}′` : ""}`).join("  ·  ")}
          </p>
        )}
      </div>

      <div className="relative" style={{ width: RING_SIZE, height: RING_SIZE, maxWidth: "82vw", maxHeight: "82vw" }}>
        <svg width="100%" height="100%" viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} className="-rotate-90">
          <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={RING_STROKE} />
          <circle
            cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={r} fill="none"
            stroke={ringColor(fraction)} strokeWidth={RING_STROKE} strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - fraction)}
            style={{ transition: "stroke-dashoffset 1s linear, stroke 1s linear" }}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
          <button
            onClick={check}
            aria-label={current.action.done ? "Undo" : "Mark done"}
            className={`pressable relative grid h-20 w-20 sm:h-24 sm:w-24 shrink-0 place-items-center rounded-3xl border-4 transition-colors ${
              current.action.done ? "border-accent bg-accent text-white dark:text-[#10160f]" : "border-line hover:border-accent"
            } ${justCompleted ? "check-pop" : ""}`}
          >
            {current.action.done && justCompleted && (
              <span className="check-ring-pulse pointer-events-none absolute inset-0 rounded-3xl border-4 border-accent" />
            )}
            {current.action.done && (
              <svg width="40" height="40" viewBox="0 0 12 12" fill="none">
                <path
                  d="M2 6.5 4.8 9 10 3.5"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  className={justCompleted ? "check-draw" : ""}
                />
              </svg>
            )}
          </button>

          <div>
            <div className={`font-display tabular-nums text-4xl sm:text-5xl leading-none text-ink ${paused ? "opacity-40" : ""}`}>
              {pad(mm)}:{pad(ss)}
            </div>
            {finished && (
              <div className={`mt-1.5 font-display tabular-nums text-base sm:text-lg leading-none text-danger ${paused ? "opacity-40" : ""}`}>
                +{pad(omm)}:{pad(oss)}
              </div>
            )}
            {paused && <div className="mt-1.5 text-xs font-medium uppercase tracking-wide text-ink-3">Paused</div>}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <button
          onClick={togglePause}
          aria-pressed={paused}
          className="pressable rounded-full border border-line bg-surface px-5 py-2 text-sm font-medium text-ink-2 hover:border-accent hover:text-accent-deep"
        >
          {paused ? "▶ Resume" : "⏸ Pause"}
        </button>
        <button onClick={onClose} className="pressable text-sm text-ink-3 hover:text-ink px-4 py-2">
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ————— running a routine: one step at a time, in order ————— */

const ASK_PRESETS = [5, 10, 15, 20, 30];

/**
 * The step runner. Timed steps get their own countdown; finishing one rolls
 * straight into the next step's timer. A step with no minutes set asks once —
 * give it a length, or keep it on screen untimed until it's done ("take your
 * meds" has no duration, but it shouldn't disappear either). "Skip for now"
 * sends the current step to the back of the line instead of pretending it
 * happened. Every tick is saved per day, so closing mid-run loses nothing,
 * and ticking the last step logs the routine's day by itself.
 */
function RoutineRun({
  item, day, onFinished, onClose,
}: {
  item: Item;
  day: string;
  onFinished: () => void;
  onClose: () => void;
}) {
  const { db, setRoutineStepDone } = useLife();
  const steps = item.steps ?? [];

  // what's left to do this run — or the whole script again, when the day
  // was already finished and this is a deliberate second lap
  const [queue, setQueue] = useState<string[]>(() => {
    const done = routineDoneSteps(db, item.id, day);
    const open = steps.filter((s) => !done.has(s.id)).map((s) => s.id);
    return open.length ? open : steps.map((s) => s.id);
  });
  const stepId = queue[0] ?? null;
  const step = steps.find((s) => s.id === stepId) ?? null;

  const [phase, setPhase] = useState<"ask" | "timed" | "open">(() =>
    step == null ? "open" : step.minutes != null ? "timed" : "ask"
  );
  const [total, setTotal] = useState(() => (step?.minutes ?? 0) * 60);
  const [remaining, setRemaining] = useState(() => (step?.minutes ?? 0) * 60);
  const [finished, setFinished] = useState(false);
  const [overtime, setOvertime] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  // wall-time anchors: the current step's deadline, or when an untimed one
  // came on screen — every displayed second derives from these
  const [endAt, setEndAt] = useState<number | null>(() =>
    step?.minutes != null ? Date.now() + step.minutes * 60_000 : null
  );
  const [startedAt, setStartedAt] = useState<number | null>(null);
  // paused wall-time instant; on resume the step's deadline (timed) or its
  // start (untimed count-up) is shifted by however long we stayed paused
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const paused = pausedAt !== null;
  const beepedRef = useRef(false);
  const [askVal, setAskVal] = useState("10");
  const [justChecked, setJustChecked] = useState(false);
  const [celebrating, setCelebrating] = useState(false);

  const enter = (s: RoutineStep) => {
    setJustChecked(false);
    setFinished(false);
    setOvertime(0);
    setElapsed(0);
    setPausedAt(null);
    beepedRef.current = false;
    if (s.minutes != null) {
      setPhase("timed");
      setTotal(s.minutes * 60);
      setRemaining(s.minutes * 60);
      setEndAt(Date.now() + s.minutes * 60_000);
      setStartedAt(null);
    } else {
      setPhase("ask");
      setAskVal("10");
      setEndAt(null);
      setStartedAt(null);
    }
  };

  /* the current timed step: countdown freezes at 00:00, overtime counts on */
  useWallClock(phase === "timed" && !celebrating && !paused && endAt != null, () => {
    if (endAt == null) return;
    const left = Math.round((endAt - Date.now()) / 1000);
    if (left > 0) {
      setRemaining(left);
      return;
    }
    setRemaining(0);
    setOvertime(-left);
    if (!beepedRef.current) {
      beepedRef.current = true;
      setFinished(true);
      beep();
    }
  });

  /* an untimed step still shows how long it's been on screen */
  useWallClock(phase === "open" && !celebrating && !paused && startedAt != null && !!step, () => {
    if (startedAt != null) setElapsed(Math.max(0, Math.round((Date.now() - startedAt) / 1000)));
  });

  // freeze the current step's clock, or shift its anchor forward by the paused
  // span so a timed countdown or an untimed count-up both pick up where they left
  const togglePause = () => {
    if (pausedAt == null) {
      const now = Date.now();
      if (phase === "timed" && endAt != null) {
        const left = Math.round((endAt - now) / 1000);
        if (left > 0) setRemaining(left);
        else { setRemaining(0); setOvertime(-left); }
      } else if (phase === "open" && startedAt != null) {
        setElapsed(Math.max(0, Math.round((now - startedAt) / 1000)));
      }
      setPausedAt(now);
    } else {
      const delta = Date.now() - pausedAt;
      if (endAt != null) setEndAt(endAt + delta);
      if (startedAt != null) setStartedAt(startedAt + delta);
      setPausedAt(null);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const doneStep = () => {
    if (!step || justChecked) return;
    setRoutineStepDone(item, day, step.id, true);
    setJustChecked(true);
    const rest = queue.slice(1);
    // let the check animation land before moving on
    setTimeout(() => {
      if (rest.length === 0) {
        setCelebrating(true);
        setTimeout(onFinished, 1400);
      } else {
        setQueue(rest);
        const next = steps.find((s) => s.id === rest[0]);
        if (next) enter(next);
      }
    }, 700);
  };

  const skipStep = () => {
    if (queue.length < 2 || justChecked) return;
    const rest = [...queue.slice(1), queue[0]];
    setQueue(rest);
    const next = steps.find((s) => s.id === rest[0]);
    if (next) enter(next);
  };

  const doneToday = routineDoneSteps(db, item.id, day);
  const next = queue.length > 1 ? steps.find((s) => s.id === queue[1]) : null;

  if (celebrating || !step) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-bg px-6 py-10 text-center">
        <p className="text-4xl">🌄</p>
        <h1 className="font-display text-[2rem] leading-tight text-ink">Routine done.</h1>
        <p className="text-sm text-ink-3">Every step, walked. 🌱</p>
      </div>
    );
  }

  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;
  const omm = Math.floor(overtime / 60);
  const oss = overtime % 60;
  const emm = Math.floor(elapsed / 60);
  const ess = elapsed % 60;
  const fraction = phase === "timed" && total > 0 ? remaining / total : 1;
  const r = (RING_SIZE - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * r;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-7 bg-bg px-6 py-10 text-center">
      <div>
        <p className="text-lg text-ink-3 mb-1">{item.title}</p>
        <h1 className="font-display text-[2rem] sm:text-[2.75rem] leading-tight text-ink max-w-3xl">
          {step.title}
        </h1>
        {/* the script at a glance: done, current, still ahead */}
        <div className="mt-3 flex items-center justify-center gap-1.5" aria-hidden>
          {steps.map((s) => (
            <span
              key={s.id}
              className={`h-1.5 rounded-full transition-all ${
                s.id === step.id
                  ? "w-5 bg-accent"
                  : doneToday.has(s.id)
                    ? "w-1.5 bg-accent/50"
                    : "w-1.5 bg-line"
              }`}
            />
          ))}
        </div>
        {next && <p className="mt-2 text-sm text-ink-3">then: {next.title}</p>}
      </div>

      {phase === "ask" ? (
        <div className="w-full max-w-sm rounded-(--radius-card) border border-line-soft bg-surface p-5 shadow-(--shadow-card) text-left">
          <p className="mb-3 text-sm text-ink-2">
            This step has no saved time. How long should it get?
          </p>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {ASK_PRESETS.map((m) => (
              <Chip key={m} active={askVal === String(m)} onClick={() => setAskVal(String(m))}>
                {m}
              </Chip>
            ))}
          </div>
          <input
            type="number"
            min={1}
            max={480}
            className={inputCls}
            value={askVal}
            onChange={(e) => setAskVal(e.target.value)}
            aria-label="Minutes for this step"
          />
          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              onClick={() => { setPhase("open"); setElapsed(0); setStartedAt(Date.now()); }}
              className="pressable text-sm font-medium text-ink-3 hover:text-ink"
            >
              No timer, just show it
            </button>
            <Button
              small
              onClick={() => {
                const m = Math.max(1, Math.min(480, Math.round(parseFloat(askVal) || 0)));
                beepedRef.current = false;
                setTotal(m * 60);
                setRemaining(m * 60);
                setFinished(false);
                setOvertime(0);
                setEndAt(Date.now() + m * 60_000);
                setPhase("timed");
              }}
            >
              Start
            </Button>
          </div>
        </div>
      ) : (
        <div className="relative" style={{ width: RING_SIZE, height: RING_SIZE, maxWidth: "82vw", maxHeight: "82vw" }}>
          <svg width="100%" height="100%" viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} className="-rotate-90">
            <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={RING_STROKE} />
            {phase === "timed" && (
              <circle
                cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={r} fill="none"
                stroke={ringColor(fraction)} strokeWidth={RING_STROKE} strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - fraction)}
                style={{ transition: "stroke-dashoffset 1s linear, stroke 1s linear" }}
              />
            )}
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <button
              onClick={doneStep}
              aria-label="Step done"
              className={`pressable relative grid h-20 w-20 sm:h-24 sm:w-24 shrink-0 place-items-center rounded-3xl border-4 transition-colors ${
                justChecked ? "border-accent bg-accent text-white dark:text-[#10160f] check-pop" : "border-line hover:border-accent"
              }`}
            >
              {justChecked && (
                <>
                  <span className="check-ring-pulse pointer-events-none absolute inset-0 rounded-3xl border-4 border-accent" />
                  <svg width="40" height="40" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M2 6.5 4.8 9 10 3.5"
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      className="check-draw"
                    />
                  </svg>
                </>
              )}
            </button>

            <div>
              {phase === "timed" ? (
                <>
                  <div className={`font-display tabular-nums text-4xl sm:text-5xl leading-none text-ink ${paused ? "opacity-40" : ""}`}>
                    {pad(mm)}:{pad(ss)}
                  </div>
                  {finished && (
                    <div className={`mt-1.5 font-display tabular-nums text-base sm:text-lg leading-none text-danger ${paused ? "opacity-40" : ""}`}>
                      +{pad(omm)}:{pad(oss)}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className={`font-display tabular-nums text-4xl sm:text-5xl leading-none text-ink ${paused ? "opacity-40" : ""}`}>
                    {pad(emm)}:{pad(ess)}
                  </div>
                  <p className="mt-1.5 text-xs text-ink-3">no timer — done when it&rsquo;s done</p>
                </>
              )}
              {paused && <div className="mt-1.5 text-xs font-medium uppercase tracking-wide text-ink-3">Paused</div>}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-6">
        {(phase === "timed" || phase === "open") && (
          <button
            onClick={togglePause}
            aria-pressed={paused}
            className="pressable rounded-full border border-line bg-surface px-4 py-1.5 text-sm font-medium text-ink-2 hover:border-accent hover:text-accent-deep"
          >
            {paused ? "▶ Resume" : "⏸ Pause"}
          </button>
        )}
        {queue.length > 1 && (
          <button onClick={skipStep} className="pressable text-sm font-medium text-ink-2 hover:text-ink px-3 py-2">
            Skip for now ↻
          </button>
        )}
        <button onClick={onClose} className="pressable text-sm text-ink-3 hover:text-ink px-3 py-2">
          Leave it here
        </button>
      </div>
    </div>
  );
}
