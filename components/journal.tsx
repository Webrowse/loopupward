"use client";

import { useState } from "react";
import { useLife } from "@/lib/data/provider";
import { Button } from "./ui";

export const MOODS = ["😞", "😕", "😐", "🙂", "😄"];
export const ENERGY = ["🪫", "🌘", "🌗", "🌖", "⚡"];

const DEFAULT_ROUGH_MAX = 5000;
const DEFAULT_EOD_MAX = 3000;

/**
 * The daily journal: free writing, mood/energy, end-of-day reflection.
 * Mood/energy save instantly (one tap = one write); the two text areas
 * only save when Save is pressed, so composing a long entry doesn't fire
 * a request per pause — one deliberate write for both fields together.
 */
export function DailyJournal({ date }: { date: string }) {
  const { db, user, saveJournal } = useLife();
  const entry = db.journal.find((j) => j.date === date);
  const [rough, setRough] = useState(entry?.roughNotes ?? "");
  const [eod, setEod] = useState(entry?.endOfDay ?? "");
  const [showEod, setShowEod] = useState(Boolean(entry?.endOfDay));
  const [justSaved, setJustSaved] = useState(false);

  const roughMax = user?.limits?.journalRoughChars ?? DEFAULT_ROUGH_MAX;
  const eodMax = user?.limits?.journalEodChars ?? DEFAULT_EOD_MAX;

  // switching days swaps the text
  const [lastDate, setLastDate] = useState(date);
  if (date !== lastDate) {
    setLastDate(date);
    setRough(entry?.roughNotes ?? "");
    setEod(entry?.endOfDay ?? "");
    setShowEod(Boolean(entry?.endOfDay));
    setJustSaved(false);
  }

  const dirty = rough !== (entry?.roughNotes ?? "") || eod !== (entry?.endOfDay ?? "");

  const save = () => {
    const patch: { roughNotes?: string; endOfDay?: string } = {};
    if (rough !== (entry?.roughNotes ?? "")) patch.roughNotes = rough;
    if (eod !== (entry?.endOfDay ?? "")) patch.endOfDay = eod;
    if (Object.keys(patch).length === 0) return;
    saveJournal(date, patch);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1800);
  };

  return (
    <section className="rounded-(--radius-card) border border-line-soft bg-surface p-5 shadow-(--shadow-card)">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-ink-3">Daily notes</h2>
        {dirty ? (
          <Button small onClick={save}>Save</Button>
        ) : justSaved ? (
          <span className="text-xs text-accent-deep">✓ saved</span>
        ) : null}
      </div>

      <textarea
        value={rough}
        maxLength={roughMax}
        onChange={(e) => setRough(e.target.value)}
        placeholder="Today I'm thinking about…"
        className="mt-3 min-h-32 w-full resize-y rounded-xl border border-line bg-bg px-3.5 py-3 text-[0.95rem] leading-relaxed text-ink placeholder:text-ink-3 outline-none focus:border-accent"
      />
      {rough.length > roughMax * 0.9 && (
        <p className="mt-1 text-right text-xs text-ink-3 tabular-nums">{rough.length}/{roughMax}</p>
      )}

      {/* mood & energy */}
      <div className="mt-4 space-y-2.5">
        <ScaleRow
          label="Mood"
          icons={MOODS}
          value={entry?.mood ?? null}
          onChange={(v) => saveJournal(date, { mood: v })}
        />
        <ScaleRow
          label="Energy"
          icons={ENERGY}
          value={entry?.energy ?? null}
          onChange={(v) => saveJournal(date, { energy: v })}
        />
      </div>

      {/* end-of-day reflection — optional, gently offered */}
      <div className="mt-5 border-t border-line-soft pt-4">
        {!showEod ? (
          <button
            onClick={() => setShowEod(true)}
            className="pressable text-sm font-medium text-accent-deep"
          >
            Close the day →
          </button>
        ) : (
          <>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-3">
              End of day
            </p>
            <p className="mt-1 text-xs text-ink-3 leading-relaxed">
              What went well? What could improve? What did you learn?
            </p>
            <textarea
              value={eod}
              maxLength={eodMax}
              onChange={(e) => setEod(e.target.value)}
              placeholder="Honest, short, yours…"
              className="mt-2 min-h-24 w-full resize-y rounded-xl border border-line bg-bg px-3.5 py-3 text-[0.95rem] leading-relaxed text-ink placeholder:text-ink-3 outline-none focus:border-accent"
            />
            {eod.length > eodMax * 0.9 && (
              <p className="mt-1 text-right text-xs text-ink-3 tabular-nums">{eod.length}/{eodMax}</p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function ScaleRow({
  label, icons, value, onChange,
}: {
  label: string;
  icons: string[];
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-ink-2">{label}</span>
      <div className="flex gap-1">
        {icons.map((icon, i) => {
          const v = i + 1;
          const active = value === v;
          return (
            <button
              key={v}
              onClick={() => onChange(active ? null : v)}
              aria-label={`${label} ${v} of 5`}
              className={`pressable grid h-8 w-8 place-items-center rounded-full text-base transition-all ${
                active ? "bg-accent-soft scale-110" : value !== null ? "opacity-40" : "opacity-70 hover:opacity-100"
              }`}
            >
              {icon}
            </button>
          );
        })}
      </div>
    </div>
  );
}
