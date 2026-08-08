"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLife } from "@/lib/data/provider";
import { routineDoneSteps, routineMinutes, todayEntries, TodayEntry } from "@/lib/progress";
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

/* ————— out of the way, still running ————— */

/** Sends the full-screen timer to the corner. Same place on every focus
 *  screen, so it's always where you last found it. */
function MinimizeButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Minimize the timer"
      title="Keep it running in the corner"
      className="pressable absolute right-4 top-[max(1rem,env(safe-area-inset-top))] inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-2 hover:border-accent hover:text-accent-deep"
    >
      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11.5 2.5 2.5 11.5" />
        <path d="M6 11.5H2.5V8" />
      </svg>
      Minimize
    </button>
  );
}

/**
 * The timer, minimized: a small floating bar that keeps the clock — and a
 * routine's place in its script — running while the rest of the app comes
 * back. Some steps ARE the app ("write today's note" is part of the night
 * routine), so the full-screen runner can't be the only way to hold a
 * countdown. Sits above the mobile tab bar, bottom-right on a wide screen,
 * and stays under sheets (z-50) so an open dialog is never fought over.
 */
function MiniBar({
  title, context, clock, hint, fraction, overtime, paused,
  onTogglePause, onDone, doneLabel, onExpand,
}: {
  title: string;
  /** the routine's name, or what kind of stretch this is */
  context?: string;
  /** "12:34", or left out when there's nothing counting (a step being set up) */
  clock?: string;
  /** replaces the context line — for a step that needs you back on screen */
  hint?: string;
  /** 1 → just started, 0 → time's up; drives the hairline under the bar */
  fraction?: number;
  overtime?: boolean;
  paused?: boolean;
  onTogglePause?: () => void;
  onDone?: () => void;
  doneLabel?: string;
  onExpand: () => void;
}) {
  return (
    <div className="no-print fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom,0px)+5rem)] z-[45] lg:inset-x-auto lg:right-6 lg:bottom-6 lg:w-80">
      <div className="fade-in overflow-hidden rounded-2xl border border-line-soft bg-surface/95 shadow-(--shadow-float) backdrop-blur-xl">
        <div className="flex items-center gap-2 px-3 py-2">
          <button
            onClick={onExpand}
            aria-label="Back to the full timer"
            className="pressable flex min-w-0 flex-1 items-center gap-2.5 text-left"
          >
            {clock && (
              <span
                className={`shrink-0 font-display text-lg leading-none tabular-nums ${
                  paused ? "text-ink-3" : overtime ? "text-danger" : "text-ink"
                }`}
              >
                {clock}
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate text-[0.8rem] leading-tight text-ink">{title}</span>
              {(hint || context || paused) && (
                <span className="block truncate text-[0.68rem] leading-tight text-ink-3">
                  {paused ? "paused" : hint ?? context}
                </span>
              )}
            </span>
          </button>

          {onTogglePause && (
            <button
              onClick={onTogglePause}
              aria-pressed={paused}
              aria-label={paused ? "Resume" : "Pause"}
              className="pressable grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm text-ink-2 hover:bg-surface-2"
            >
              <span aria-hidden>{paused ? "▶" : "⏸"}</span>
            </button>
          )}

          {onDone && (
            <button
              onClick={onDone}
              aria-label={doneLabel ?? "Mark done"}
              className="pressable grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-line text-ink-3 transition-colors hover:border-accent hover:text-accent-deep"
            >
              <svg width="13" height="13" viewBox="0 0 12 12" fill="none">
                <path d="M2 6.5 4.8 9 10 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}

          <button
            onClick={onExpand}
            aria-label="Back to the full timer"
            className="pressable grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink"
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2.5 11.5 11.5 2.5" />
              <path d="M8 2.5h3.5V6" />
            </svg>
          </button>
        </div>

        {fraction != null && (
          <div className="h-0.5 w-full bg-line-soft">
            <div
              className="h-full"
              style={{
                width: `${Math.max(0, Math.min(1, fraction)) * 100}%`,
                background: ringColor(fraction),
                transition: "width 1s linear, background-color 1s linear",
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
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
 *
 * Minimized, all of that keeps running in a small corner bar instead: the
 * clock, the routine's place in its script, everything. Some tasks ARE the
 * app ("write the daily note" is a step of the night routine), so the timer
 * can't be the only thing on screen.
 */
export function FocusTimer({
  open, entries, initialEntryId, autoRun = false, minimized = false,
  onMinimize, onRestore, onToggle, onClose,
}: {
  open: boolean;
  entries: TodayEntry[];
  initialEntryId: string | null;
  /** open a routine straight into its step runner, skipping the setup sheet */
  autoRun?: boolean;
  /** running, but out of the way — see MiniBar */
  minimized?: boolean;
  onMinimize?: () => void;
  onRestore?: () => void;
  onToggle: (entry: TodayEntry) => void;
  onClose: () => void;
}) {
  const { restSeconds, holdSync } = useLife();
  const [activeId, setActiveId] = useState<string | null>(initialEntryId);
  const [minutes, setMinutes] = useState(25);
  const [running, setRunning] = useState(false);
  // a routine doesn't run as one block of minutes — it walks its script
  // step by step, so Start hands over to the step runner instead. Seeded from
  // autoRun for the case where this mounts already open (▶ Run) rather than
  // opening later — see the open-transition reset below.
  const [runningRoutine, setRunningRoutine] = useState(open && autoRun);
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
  // a breather before the NEXT task's timer starts — only after finishing one
  // this session, never before the first
  const [completedOne, setCompletedOne] = useState(false);
  const [resting, setResting] = useState(false);
  // rows ticked off on the "what's next" screen — kept listed (checked, dimmed)
  // instead of vanishing the instant they're done, so a handful can be cleared
  // in one pass and any mistake un-ticked on the spot
  const [tickedOff, setTickedOff] = useState<string[]>([]);
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
      setCompletedOne(false);
      setResting(false);
      setTickedOff([]);
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
      setCompletedOne(false);
      setResting(false);
      setTickedOff([]);
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

  // hold the tab-return refresh for the whole session, minimized or not: step
  // ticks written mid-run must not be clobbered by a full-db reload when the
  // user comes back to the tab
  useEffect(() => {
    if (!open) return;
    return holdSync();
  }, [open, holdSync]);

  // minimized, the app underneath is the point — it scrolls, and Escape
  // belongs to whatever the user is actually working in
  useEffect(() => {
    if (!open || minimized) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, minimized, onClose]);

  if (!open) return null;

  const expand = () => onRestore?.();

  const beginTimer = () => {
    beepedRef.current = false;
    setEndAt(Date.now() + minutes * 60_000);
    setRemaining(minutes * 60);
    setFinished(false);
    setOvertime(0);
    setPausedAt(null);
    setResting(false);
    setRunning(true);
  };

  // the first task of a session starts straight away; a task picked after
  // finishing one gets the chosen breather first (unless rest is off)
  const start = () => {
    if (completedOne && restSeconds > 0) setResting(true);
    else beginTimer();
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
    setResting(false);
  };

  // marking a carried-over task done drops it out of `entries` entirely (it
  // only ever shows up there while still undone), so `current` can go null
  // the moment that happens — this screen must not depend on it still
  // resolving, or the whole timer silently unmounts back to the Today page
  if (pickingNext) {
    // half of what's still listed was often just done off-screen — a routine
    // walks you through the reading and the decluttering that also stand as
    // their own targets. So each row ticks off right here; only the ones you
    // actually want a countdown for need the timer.
    const rows = entries.filter((e) => !e.action.done || tickedOff.includes(e.action.id));
    const tick = (e: TodayEntry) => {
      setTickedOff((prev) => (prev.includes(e.action.id) ? prev : [...prev, e.action.id]));
      onToggle(e);
    };

    // nothing left to pick means there's nothing to decide — the day itself
    // is the reward, so take a beat and hand the app back instead of parking
    // on a screen whose only move is "Later"
    if (rows.length === 0) return <DayCleared onClose={onClose} />;

    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-bg px-6 py-10 text-center">
        <div>
          <p className="text-lg text-accent-deep font-medium mb-1">Nice work. 🌱</p>
          <h1 className="font-display text-[1.75rem] sm:text-[2rem] leading-tight text-ink">
            What&rsquo;s next?
          </h1>
        </div>

        <>
          <p className="-mt-3 max-w-xs text-sm text-ink-3">
            Tick off anything you already did, or pick one to focus on.
          </p>
          <div className="w-full max-w-sm space-y-2 overflow-y-auto" style={{ maxHeight: "50vh" }}>
              {rows.map((e) => {
                const done = e.action.done;
                return (
                  <div
                    key={e.action.id}
                    className={`flex items-center gap-3 rounded-(--radius-card) border border-line-soft bg-surface px-3 py-2.5 text-left shadow-(--shadow-card) transition-opacity ${
                      done ? "opacity-60" : ""
                    }`}
                  >
                    <button
                      onClick={() => tick(e)}
                      aria-label={done ? "Undo" : "Mark done"}
                      className={`pressable grid h-7 w-7 shrink-0 place-items-center border-2 transition-colors ${
                        e.virtualHabit ? "rounded-full" : "rounded-lg"
                      } ${done ? "border-accent bg-accent text-white dark:text-[#10160f]" : "border-line hover:border-accent"}`}
                    >
                      {done && (
                        <svg className="bloom" width="13" height="13" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6.5 4.8 9 10 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                    <span
                      className={`min-w-0 flex-1 text-[0.95rem] ${done ? "text-ink-3 line-through decoration-ink-3/40" : "text-ink"}`}
                    >
                      {entryText(e).title}
                    </span>
                    {!done && (
                      <button
                        onClick={() => pickNext(e)}
                        aria-label="Focus on this with a timer"
                        className="pressable shrink-0 rounded-full border border-line px-2.5 py-1 text-xs font-medium text-ink-2 hover:border-accent hover:text-accent-deep"
                      >
                        Focus
                      </button>
                    )}
                  </div>
                );
              })}
          </div>
        </>

        {/* "Later" only makes sense while something is still waiting — once
            every row here is ticked, leaving is finishing, not postponing */}
        <button onClick={onClose} className="pressable text-sm font-medium text-ink-3 hover:text-ink px-4 py-2">
          {rows.some((e) => !e.action.done) ? "Later" : "Done"}
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
      setCompletedOne(true); // the next task this session earns a breather first
      // finishing something is worth the whole screen, even if the timer was
      // ticking away in the corner a second ago
      expand();
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
        minimized={minimized}
        onMinimize={onMinimize}
        onRestore={onRestore}
        onFinished={() => {
          setRunningRoutine(false);
          setPickingNext(true);
        }}
        onClose={onClose}
      />
    );
  }

  if (resting) {
    return (
      <RestBreak
        nextTitle={title}
        seconds={restSeconds}
        minimized={minimized}
        onMinimize={onMinimize}
        onRestore={onRestore}
        onDone={beginTimer}
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
                <span className="min-w-0 truncate text-ink-2">
                  {i + 1}. {s.title}
                  {s.optional && <span className="ml-1.5 text-xs text-ink-3">optional</span>}
                </span>
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

  if (minimized) {
    return (
      <MiniBar
        title={title}
        context={subtitle ?? "Focusing"}
        clock={finished ? `+${pad(omm)}:${pad(oss)}` : `${pad(mm)}:${pad(ss)}`}
        overtime={finished}
        fraction={fraction}
        paused={paused}
        onTogglePause={togglePause}
        onDone={check}
        onExpand={expand}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-8 bg-bg px-6 py-10 text-center">
      {onMinimize && <MinimizeButton onClick={onMinimize} />}
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

/**
 * The last thing off the list. There's nothing to choose here and nothing to
 * come back to, so this is a moment, not a screen: it says the day is clear
 * and then gets out of the way on its own (or the instant it's tapped). The
 * Today page carries the rest of the reward.
 */
function DayCleared({ onClose }: { onClose: () => void }) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const t = setTimeout(() => closeRef.current(), 1400);
    return () => clearTimeout(t);
  }, []);
  return (
    <div
      onClick={onClose}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClose();
      }}
      aria-label="Back to today"
      className="fixed inset-0 z-[100] flex cursor-pointer flex-col items-center justify-center gap-3 bg-bg px-6 py-10 text-center"
    >
      <p className="text-4xl">🌱</p>
      <h1 className="font-display text-[1.75rem] sm:text-[2rem] leading-tight text-ink">
        Everything&rsquo;s done
      </h1>
      <p className="text-sm text-ink-3">Today&rsquo;s list is clear. Rest well.</p>
    </div>
  );
}

/**
 * A routine's script, walked. Everything the runner needs comes from the
 * routine itself: its steps, which of them today's note already ticked, and
 * where a tick should be written.
 */
function RoutineRun({
  item, day, minimized, onMinimize, onRestore, onFinished, onClose,
}: {
  item: Item;
  day: string;
  minimized?: boolean;
  onMinimize?: () => void;
  onRestore?: () => void;
  onFinished: () => void;
  onClose: () => void;
}) {
  const { db, setRoutineStepDone } = useLife();
  return (
    <StepRun
      title={item.title}
      steps={item.steps ?? []}
      doneIds={routineDoneSteps(db, item.id, day)}
      onStepDone={(stepId, done) => setRoutineStepDone(item, day, stepId, done)}
      minimized={minimized}
      onMinimize={onMinimize}
      onRestore={onRestore}
      onFinished={onFinished}
      onClose={onClose}
    />
  );
}

/**
 * The day's own scattered tasks, walked the same way — one on screen at a
 * time, in the order you chose, instead of picked one by one off the list.
 * Nothing is stored: this is a way of doing today's list, not a new routine,
 * so the steps are the entries themselves and a tick is the same tick the
 * list's own checkbox writes.
 */
function DayRun({
  day, plan, minimized, onMinimize, onRestore, onFinished, onClose,
}: {
  day: string;
  /** the chosen entries, in the chosen order, with the lengths chosen for them */
  plan: { entryId: string; minutes: number | null }[];
  minimized?: boolean;
  onMinimize?: () => void;
  onRestore?: () => void;
  onFinished: () => void;
  onClose: () => void;
}) {
  const { db, toggleEntry } = useLife();
  const entries = useMemo(() => todayEntries(db, day), [db, day]);
  const byId = useMemo(() => new Map(entries.map((e) => [e.action.id, e])), [entries]);

  const steps: RoutineStep[] = plan
    .filter((p) => byId.has(p.entryId))
    .map((p) => ({
      id: p.entryId,
      title: entryText(byId.get(p.entryId)!).title,
      minutes: p.minutes,
      itemId: null,
    }));

  // a task ticked off elsewhere (or before the run started) counts as walked
  const doneIds = new Set(steps.filter((s) => byId.get(s.id)?.action.done).map((s) => s.id));

  return (
    <StepRun
      title="Today"
      steps={steps}
      doneIds={doneIds}
      untimedAsks={false}
      finishedWords={{
        emoji: "🌿",
        headline: "That's the stretch.",
        sub: `${steps.length} thing${steps.length === 1 ? "" : "s"}, walked through. 🌱`,
      }}
      onStepDone={(entryId, done) => {
        const entry = byId.get(entryId);
        // toggleEntry flips, so only call it when the row disagrees with the tick
        if (entry && entry.action.done !== done) toggleEntry(entry, day);
      }}
      minimized={minimized}
      onMinimize={onMinimize}
      onRestore={onRestore}
      onFinished={onFinished}
      onClose={onClose}
    />
  );
}

/**
 * A day run, from the outside: the walk itself, then the same closing beat the
 * focus timer gives you. Kept here rather than in the session host so both
 * kinds of run end the same way.
 */
export function DayRunHost({
  day, plan, minimized, onMinimize, onRestore, onClose,
}: {
  day: string;
  plan: { entryId: string; minutes: number | null }[];
  minimized?: boolean;
  onMinimize?: () => void;
  onRestore?: () => void;
  onClose: () => void;
}) {
  const [finished, setFinished] = useState(false);
  if (finished) return <DayCleared onClose={onClose} />;
  return (
    <DayRun
      day={day}
      plan={plan}
      minimized={minimized}
      onMinimize={onMinimize}
      onRestore={onRestore}
      onFinished={() => {
        onRestore?.();
        setFinished(true);
      }}
      onClose={onClose}
    />
  );
}

/* ————— a breather between tasks/steps: a short, skippable countdown ————— */

/**
 * The rest pad. A brief wall-clock countdown that names what's coming and
 * starts it on its own when the timer runs out — or the instant you tap
 * "Start now". Length is the user's chosen rest (see restSeconds); this only
 * ever renders when that's above zero.
 */
function RestBreak({
  nextTitle, seconds, minimized = false, onMinimize, onRestore, onDone, onClose,
}: {
  nextTitle?: string;
  seconds: number;
  minimized?: boolean;
  onMinimize?: () => void;
  onRestore?: () => void;
  onDone: () => void;
  onClose: () => void;
}) {
  const [endAt] = useState(() => Date.now() + Math.max(1, seconds) * 1000);
  const [remaining, setRemaining] = useState(Math.max(1, seconds));
  const doneRef = useRef(false);
  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };
  useWallClock(true, () => {
    const left = Math.ceil((endAt - Date.now()) / 1000);
    if (left <= 0) { setRemaining(0); finish(); }
    else setRemaining(left);
  });
  useEffect(() => {
    if (minimized) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [minimized, onClose]);

  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;

  // the breather runs down in the corner too — otherwise minimizing during a
  // routine would throw the whole screen back at you between every step
  if (minimized) {
    return (
      <MiniBar
        title={nextTitle ?? "Keep going"}
        context="Breather — next up"
        clock={`${pad(mm)}:${pad(ss)}`}
        fraction={seconds > 0 ? remaining / Math.max(1, seconds) : undefined}
        onDone={finish}
        doneLabel="Start now"
        onExpand={() => onRestore?.()}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-bg px-6 py-10 text-center">
      {onMinimize && <MinimizeButton onClick={onMinimize} />}
      <p className="text-lg font-medium text-accent-deep">Nice work. 🌱</p>
      <div>
        <p className="text-sm text-ink-3">Next</p>
        <h1 className="mt-1 max-w-2xl font-display text-[1.75rem] sm:text-[2rem] leading-tight text-ink">
          {nextTitle ?? "Keep going"}
        </h1>
      </div>
      <div className="font-display tabular-nums text-5xl sm:text-6xl leading-none text-ink">
        {mm}:{pad(ss)}
      </div>
      <div className="flex items-center gap-6">
        <Button onClick={finish}>Start now</Button>
        <button onClick={onClose} className="pressable px-4 py-2 text-sm text-ink-3 hover:text-ink">
          Leave
        </button>
      </div>
      <p className="text-xs text-ink-3">Your progress so far is saved either way.</p>
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
 * happened, and "Rearrange" opens the rest of the run so any step can be
 * pulled to the front (c and d aren't happening today — e is). Every tick is
 * saved per day, so closing mid-run loses nothing, and ticking the last step
 * logs the routine's day by itself.
 */
function StepRun({
  title, steps, doneIds, onStepDone, untimedAsks = true, finishedWords,
  minimized = false, onMinimize, onRestore, onFinished, onClose,
}: {
  /** what is being walked — a routine's name, or the day itself */
  title: string;
  steps: RoutineStep[];
  /** steps already ticked, so a half-finished run picks up where it stopped */
  doneIds: Set<string>;
  onStepDone: (stepId: string, done: boolean) => void;
  /** What a step with no minutes means. In a routine's script it usually means
   *  the script was never finished, so the runner asks once. In a day's run the
   *  blank was a deliberate choice made moments ago in the pre-flight, and
   *  asking again would just undo it — those steps count up instead. */
  untimedAsks?: boolean;
  /** what the last tick earns you — a routine and a chosen stretch of the day
   *  are not the same accomplishment, and should not say the same thing */
  finishedWords?: { emoji: string; headline: string; sub: string };
  minimized?: boolean;
  onMinimize?: () => void;
  onRestore?: () => void;
  onFinished: () => void;
  onClose: () => void;
}) {
  const { restSeconds } = useLife();

  // what's left to do this run — or the whole script again, when the day
  // was already finished and this is a deliberate second lap
  const [queue, setQueue] = useState<string[]>(() => {
    const open = steps.filter((s) => !doneIds.has(s.id)).map((s) => s.id);
    return open.length ? open : steps.map((s) => s.id);
  });
  const stepId = queue[0] ?? null;
  const step = steps.find((s) => s.id === stepId) ?? null;

  const [phase, setPhase] = useState<"ask" | "timed" | "open">(() =>
    step == null || step.minutes == null ? (untimedAsks && step ? "ask" : "open") : "timed"
  );
  const [total, setTotal] = useState(() => (step?.minutes ?? 0) * 60);
  const [remaining, setRemaining] = useState(() => (step?.minutes ?? 0) * 60);
  const [finished, setFinished] = useState(false);
  const [overtime, setOvertime] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  // Wall-time anchors: the current step's deadline, or the instant an untimed
  // one came on screen. Every displayed second is derived from these, and
  // nothing renders them directly — so they're refs, set by the first tick
  // after a step begins rather than by whoever started it. Clearing one is
  // how a step says "anchor me again from now".
  const endAtRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  // paused wall-time instant; on resume the step's deadline (timed) or its
  // start (untimed count-up) is shifted by however long we stayed paused
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const paused = pausedAt !== null;
  const beepedRef = useRef(false);
  const [askVal, setAskVal] = useState("10");
  const [justChecked, setJustChecked] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  // when set, we're on the breather between a finished step and this queue's
  // next step — the RestBreak screen shows until it ends or is skipped
  const [pendingQueue, setPendingQueue] = useState<string[] | null>(null);
  // the rest-of-the-run panel: reorder what's left without stopping the run
  const [arranging, setArranging] = useState(false);
  // whether an optional step was deliberately left out, so the closing line
  // does not claim every step was walked when one was waved past
  const [leftSomeOut, setLeftSomeOut] = useState(false);

  /** Put a step on screen with a clean clock. Takes an id so every route into
   *  it — next in line, skipped to the back, pulled forward from the panel —
   *  is the same one call; an id that no longer exists is simply nothing. */
  const enter = (stepId: string | undefined) => {
    const s = stepId ? steps.find((x) => x.id === stepId) : undefined;
    if (!s) return;
    setJustChecked(false);
    setFinished(false);
    setOvertime(0);
    setElapsed(0);
    setPausedAt(null);
    beepedRef.current = false;
    endAtRef.current = null;
    startedAtRef.current = null;
    if (s.minutes != null) {
      setPhase("timed");
      setTotal(s.minutes * 60);
      setRemaining(s.minutes * 60);
    } else if (untimedAsks) {
      setPhase("ask");
      setAskVal("10");
    } else {
      setPhase("open");
    }
  };

  /* the current timed step: countdown freezes at 00:00, overtime counts on.
   * The first tick after a step starts is what sets its deadline — the clock
   * is only ever read from inside the tick, never while rendering. */
  useWallClock(phase === "timed" && !celebrating && !paused && pendingQueue == null, () => {
    if (endAtRef.current == null) endAtRef.current = Date.now() + total * 1000;
    const left = Math.round((endAtRef.current - Date.now()) / 1000);
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
  useWallClock(phase === "open" && !celebrating && !paused && pendingQueue == null && !!step, () => {
    if (startedAtRef.current == null) startedAtRef.current = Date.now();
    setElapsed(Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000)));
  });

  // freeze the current step's clock, or shift its anchor forward by the paused
  // span so a timed countdown or an untimed count-up both pick up where they left
  const togglePause = () => {
    if (pausedAt == null) {
      const now = Date.now();
      const endAt = endAtRef.current;
      const startedAt = startedAtRef.current;
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
      if (endAtRef.current != null) endAtRef.current += delta;
      if (startedAtRef.current != null) startedAtRef.current += delta;
      setPausedAt(null);
    }
  };

  // The runner stays mounted while minimized so the clock and the queue keep
  // going, but it no longer owns the screen: the page underneath has to
  // scroll, and Escape belongs to whatever the user is actually working in.
  useEffect(() => {
    if (minimized) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [minimized, onClose]);

  const doneStep = () => {
    if (!step || justChecked) return;
    onStepDone(step.id, true);
    setJustChecked(true);
    const rest = queue.slice(1);
    // let the check animation land before moving on
    setTimeout(() => {
      if (rest.length === 0) {
        // the end of a routine deserves the full screen back
        onRestore?.();
        setCelebrating(true);
        setTimeout(onFinished, 1400);
      } else if (restSeconds > 0) {
        setPendingQueue(rest); // a breather, then the next step
      } else {
        setQueue(rest);
        enter(rest[0]);
      }
    }, 700);
  };

  // leave the breather and pick up the next step (countdown ran out, or skipped)
  const proceedAfterRest = () => {
    const q = pendingQueue;
    setPendingQueue(null);
    if (!q) return;
    setQueue(q);
    enter(q[0]);
  };

  const skipStep = () => {
    if (queue.length < 2 || justChecked) return;
    const rest = [...queue.slice(1), queue[0]];
    setQueue(rest);
    enter(rest[0]);
  };

  /** Leave an optional step out of this run for good. "Skip for now" sends a
   *  step to the back of the line, which is right for something you still owe
   *  and wrong for something the routine never needed — that one should simply
   *  be gone, and the run should end when only such steps remain. */
  const dropStep = () => {
    if (justChecked) return;
    setLeftSomeOut(true);
    const rest = queue.slice(1);
    if (rest.length === 0) {
      onRestore?.();
      setCelebrating(true);
      setTimeout(onFinished, 1400);
      return;
    }
    setQueue(rest);
    enter(rest[0]);
  };

  /* ——— rearranging what's left, mid-run ——— */

  /** Pull a step to the front and start it now. Everything else keeps its
   *  order, so the steps you jumped over are still waiting behind it. */
  const jumpTo = (stepId: string) => {
    if (justChecked) return;
    setArranging(false);
    if (stepId === queue[0]) return;
    setQueue([stepId, ...queue.filter((id) => id !== stepId)]);
    enter(stepId);
  };

  /** Tick a step off from the panel — done earlier, or done alongside
   *  another. It leaves the queue; if it was the one on screen, the run
   *  moves on exactly as if its own check had been tapped. */
  const tickFromPanel = (stepId: string) => {
    if (justChecked) return;
    onStepDone(stepId, true);
    const rest = queue.filter((id) => id !== stepId);
    if (rest.length === 0) {
      setArranging(false);
      onRestore?.();
      setCelebrating(true);
      setTimeout(onFinished, 1400);
      return;
    }
    setQueue(rest);
    // it was the one on screen — move on exactly as its own check would
    if (stepId === queue[0]) enter(rest[0]);
  };

  /** Un-tick something finished earlier — it goes back to the end of the
   *  line rather than interrupting whatever is on screen now. */
  const reopenStep = (stepId: string) => {
    onStepDone(stepId, false);
    setQueue((q) => (q.includes(stepId) ? q : [...q, stepId]));
  };

  const doneToday = doneIds;
  const next = queue.length > 1 ? steps.find((s) => s.id === queue[1]) : null;

  if (celebrating || !step) {
    const words = finishedWords ?? {
      emoji: "🌄",
      headline: "Routine done.",
      sub: leftSomeOut ? "The ones that mattered, done. 🌱" : "Every step, walked. 🌱",
    };
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-bg px-6 py-10 text-center">
        <p className="text-4xl">{words.emoji}</p>
        <h1 className="font-display text-[2rem] leading-tight text-ink">{words.headline}</h1>
        <p className="text-sm text-ink-3">{words.sub}</p>
      </div>
    );
  }

  if (pendingQueue) {
    const nextStep = steps.find((s) => s.id === pendingQueue[0]);
    return (
      <RestBreak
        nextTitle={nextStep?.title}
        seconds={restSeconds}
        minimized={minimized}
        onMinimize={onMinimize}
        onRestore={onRestore}
        onDone={proceedAfterRest}
        onClose={onClose}
      />
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

  if (minimized) {
    return (
      <MiniBar
        title={step.title}
        context={title}
        clock={
          phase === "ask"
            ? undefined
            : phase === "timed"
              ? finished ? `+${pad(omm)}:${pad(oss)}` : `${pad(mm)}:${pad(ss)}`
              : `${pad(emm)}:${pad(ess)}`
        }
        overtime={phase === "timed" && finished}
        hint={phase === "ask" ? "needs a length — tap to open" : undefined}
        fraction={phase === "timed" ? fraction : undefined}
        paused={paused}
        onTogglePause={phase === "ask" ? undefined : togglePause}
        onDone={phase === "ask" ? undefined : doneStep}
        doneLabel="Step done"
        onExpand={() => onRestore?.()}
      />
    );
  }

  // the run, laid out: pull anything still waiting to the front, tick off
  // what happened away from the screen, or bring back something finished
  if (arranging) {
    const remainingSteps = queue
      .map((id) => steps.find((s) => s.id === id))
      .filter((s): s is RoutineStep => !!s);
    const finishedSteps = steps.filter((s) => doneToday.has(s.id) && !queue.includes(s.id));
    return (
      <div className="fixed inset-0 z-[100] flex flex-col bg-bg px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full max-w-md">
          <p className="text-sm text-ink-3">{title}</p>
          <h1 className="mt-1 font-display text-[1.6rem] leading-tight text-ink">The rest of this run</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-3">
            Tap a step to do it next. Steps you skip past keep their place in line.
          </p>
        </div>

        <div className="mx-auto mt-5 w-full max-w-md flex-1 space-y-2 overflow-y-auto">
          {remainingSteps.map((s, i) => (
            <div
              key={s.id}
              className={`flex items-center gap-3 rounded-(--radius-card) border bg-surface px-3 py-2.5 shadow-(--shadow-card) ${
                i === 0 ? "border-accent" : "border-line-soft"
              }`}
            >
              <button
                onClick={() => tickFromPanel(s.id)}
                aria-label={`Mark "${s.title}" done`}
                title="Done already — tick it off"
                className="pressable group grid h-7 w-7 shrink-0 place-items-center rounded-lg border-2 border-line text-ink-3 transition-colors hover:border-accent hover:text-accent-deep"
              >
                {/* faint until you reach for it: this is an empty box you can
                    tick, not a step already ticked */}
                <svg
                  width="13" height="13" viewBox="0 0 12 12" fill="none"
                  className="opacity-30 transition-opacity group-hover:opacity-100"
                >
                  <path d="M2 6.5 4.8 9 10 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                onClick={() => jumpTo(s.id)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="block truncate text-[0.95rem] text-ink">{s.title}</span>
                <span className="block text-xs text-ink-3 tabular-nums">
                  {i === 0 ? "on now" : s.minutes != null ? `${s.minutes} min` : "no timer"}
                </span>
              </button>
              {i > 0 && (
                <button
                  onClick={() => jumpTo(s.id)}
                  className="pressable shrink-0 rounded-full border border-line px-2.5 py-1 text-xs font-medium text-ink-2 hover:border-accent hover:text-accent-deep"
                >
                  Do next
                </button>
              )}
            </div>
          ))}

          {finishedSteps.length > 0 && (
            <div className="pt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-3">Done today</p>
              <div className="space-y-1.5">
                {finishedSteps.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 rounded-xl border border-line-soft px-3 py-2 opacity-70">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg border-2 border-accent bg-accent text-white dark:text-[#10160f]">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6.5 4.8 9 10 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-ink-3 line-through decoration-ink-3/40">{s.title}</span>
                    <button
                      onClick={() => reopenStep(s.id)}
                      className="pressable shrink-0 text-xs font-medium text-ink-3 hover:text-ink"
                    >
                      Put back
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mx-auto mt-5 w-full max-w-md">
          <Button full onClick={() => setArranging(false)}>Back to the step</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-7 bg-bg px-6 py-10 text-center">
      {onMinimize && <MinimizeButton onClick={onMinimize} />}
      <div>
        <p className="text-lg text-ink-3 mb-1">{title}</p>
        <h1 className="font-display text-[2rem] sm:text-[2.75rem] leading-tight text-ink max-w-3xl">
          {step.title}
        </h1>
        {step.optional && (
          <p className="mt-1 text-sm text-ink-3">optional — the routine finishes without it</p>
        )}
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
              onClick={() => {
                startedAtRef.current = null;
                setElapsed(0);
                setPhase("open");
              }}
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
                endAtRef.current = null;
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

      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
        {(phase === "timed" || phase === "open") && (
          <button
            onClick={togglePause}
            aria-pressed={paused}
            className="pressable rounded-full border border-line bg-surface px-4 py-1.5 text-sm font-medium text-ink-2 hover:border-accent hover:text-accent-deep"
          >
            {paused ? "▶ Resume" : "⏸ Pause"}
          </button>
        )}
        {step.optional ? (
          <button onClick={dropStep} className="pressable text-sm font-medium text-ink-2 hover:text-ink px-3 py-2">
            Leave it out
          </button>
        ) : (
          queue.length > 1 && (
            <button onClick={skipStep} className="pressable text-sm font-medium text-ink-2 hover:text-ink px-3 py-2">
              Skip for now ↻
            </button>
          )
        )}
        {steps.length > 1 && (
          <button onClick={() => setArranging(true)} className="pressable text-sm font-medium text-ink-2 hover:text-ink px-3 py-2">
            Rearrange ⇅
          </button>
        )}
        <button onClick={onClose} className="pressable text-sm text-ink-3 hover:text-ink px-3 py-2">
          Leave it here
        </button>
      </div>
    </div>
  );
}
