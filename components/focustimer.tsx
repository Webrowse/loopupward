"use client";

import { useEffect, useState } from "react";
import { Chip, Field, Sheet, inputCls } from "@/components/ui";

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

/**
 * A full-screen, single-purpose focus mode: pick a length, then nothing on
 * screen but the task, a big checkbox and a countdown until it ends. No
 * pause — the point is one task and no fiddling until time's up or you quit.
 * The ring around the countdown depletes and shifts from green to red as
 * time runs out; past zero it holds empty while a small count-up beside the
 * frozen 00:00 tracks how far into overtime the task ran.
 */
export function FocusTimer({
  open, title, subtitle, done, onToggle, onClose,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  done: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const [minutes, setMinutes] = useState(25);
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [finished, setFinished] = useState(false);
  const [overtime, setOvertime] = useState(0);
  const [justCompleted, setJustCompleted] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) {
      setRunning(false);
      setFinished(false);
      setMinutes(25);
      setOvertime(0);
      setJustCompleted(false);
    }
  }

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(id);
          setFinished(true);
          beep();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  // the countdown stops dead at 00:00 — this is the separate clock that
  // starts from zero the moment it does, tracking overtime on its own
  useEffect(() => {
    if (!finished) return;
    const id = setInterval(() => setOvertime((o) => o + 1), 1000);
    return () => clearInterval(id);
  }, [finished]);

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
    setRemaining(minutes * 60);
    setFinished(false);
    setOvertime(0);
    setRunning(true);
  };

  const check = () => {
    const completing = !done;
    onToggle();
    if (completing) {
      // let the pop, the check stroke, and the ring pulse actually play
      // before the screen cuts away — that pause is the whole point
      setJustCompleted(true);
      setTimeout(onClose, 900);
    } else {
      setJustCompleted(false);
      setTimeout(onClose, 300);
    }
  };

  if (!running) {
    return (
      <Sheet
        open={open}
        onClose={onClose}
        title="Focus on this"
        primary={{ label: "Start", onClick: start }}
      >
        <p className="text-sm text-ink-2 leading-relaxed mb-1">&ldquo;{title}&rdquo;</p>
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
            aria-label={done ? "Undo" : "Mark done"}
            className={`pressable relative grid h-20 w-20 sm:h-24 sm:w-24 shrink-0 place-items-center rounded-3xl border-4 transition-colors ${
              done ? "border-accent bg-accent text-white dark:text-[#10160f]" : "border-line hover:border-accent"
            } ${justCompleted ? "check-pop" : ""}`}
          >
            {done && justCompleted && (
              <span className="check-ring-pulse pointer-events-none absolute inset-0 rounded-3xl border-4 border-accent" />
            )}
            {done && (
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
            <div className="font-display tabular-nums text-4xl sm:text-5xl leading-none text-ink">
              {pad(mm)}:{pad(ss)}
            </div>
            {finished && (
              <div className="mt-1.5 font-display tabular-nums text-base sm:text-lg leading-none text-danger">
                +{pad(omm)}:{pad(oss)}
              </div>
            )}
          </div>
        </div>
      </div>

      <button onClick={onClose} className="pressable text-sm text-ink-3 hover:text-ink px-4 py-2">
        Cancel
      </button>
    </div>
  );
}
