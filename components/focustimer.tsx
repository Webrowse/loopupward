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

/**
 * A full-screen, single-purpose focus mode: pick a length, then nothing on
 * screen but the task, a big checkbox and a countdown until it ends. No
 * pause — the point is one task and no fiddling until time's up or you quit.
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
  const [wasOpen, setWasOpen] = useState(open);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) {
      setRunning(false);
      setFinished(false);
      setMinutes(25);
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
    setRunning(true);
  };

  const check = () => {
    onToggle();
    setTimeout(onClose, 600);
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

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-10 bg-bg px-6 py-10 text-center">
      <div>
        {subtitle && <p className="text-lg text-ink-3 mb-1">{subtitle}</p>}
        <h1 className="font-display text-[2rem] sm:text-[2.75rem] leading-tight text-ink max-w-3xl">
          {title}
        </h1>
      </div>

      <button
        onClick={check}
        aria-label={done ? "Undo" : "Mark done"}
        className={`pressable relative grid h-24 w-24 sm:h-28 sm:w-28 shrink-0 place-items-center rounded-[28px] border-4 transition-colors ${
          done ? "border-accent bg-accent text-white dark:text-[#10160f]" : "border-line hover:border-accent"
        }`}
      >
        {done && (
          <svg className="bloom" width="48" height="48" viewBox="0 0 12 12" fill="none">
            <path d="M2 6.5 4.8 9 10 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      <div className={finished ? "animate-pulse" : ""}>
        <div className="font-display tabular-nums text-[5rem] sm:text-[8rem] leading-none text-ink">
          {pad(mm)}:{pad(ss)}
        </div>
        {finished && <p className="mt-2 text-lg text-accent-deep font-medium">Time&rsquo;s up</p>}
      </div>

      <button onClick={onClose} className="pressable text-sm text-ink-3 hover:text-ink px-4 py-2">
        Cancel
      </button>
    </div>
  );
}
