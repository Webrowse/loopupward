"use client";

import { useState } from "react";
import { useLife } from "@/lib/data/provider";
import { prettyDay } from "@/lib/dates";
import { Button, Sheet } from "./ui";

export const MOODS = ["😞", "😕", "😐", "🙂", "😄"];
export const ENERGY = ["🪫", "🌘", "🌗", "🌖", "⚡"];

const DEFAULT_ROUGH_MAX = 5000;
const DEFAULT_EOD_MAX = 3000;

/**
 * The daily journal: free writing, mood/energy, end-of-day reflection.
 * Mood/energy save instantly (one tap = one write); the two text areas
 * only save when Save is pressed, so composing a long entry doesn't fire
 * a request per pause — one deliberate write for both fields together.
 * An "expand" button reopens the exact same fields in a wide dialog for
 * more writing room, rather than only relying on drag-to-resize.
 */
export function DailyJournal({ date }: { date: string }) {
  const { db, user, saveJournal } = useLife();
  const entry = db.journal.find((j) => j.date === date);
  const [rough, setRough] = useState(entry?.roughNotes ?? "");
  const [eod, setEod] = useState(entry?.endOfDay ?? "");
  const [showEod, setShowEod] = useState(Boolean(entry?.endOfDay));
  const [justSaved, setJustSaved] = useState(false);
  const [expanded, setExpanded] = useState(false);

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
    setExpanded(false);
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

  const fieldsProps = {
    rough, setRough, eod, setEod, showEod, setShowEod, roughMax, eodMax,
    mood: entry?.mood ?? null,
    energy: entry?.energy ?? null,
    onMood: (v: number | null) => saveJournal(date, { mood: v }),
    onEnergy: (v: number | null) => saveJournal(date, { energy: v }),
  };

  return (
    <section className="rounded-(--radius-card) border border-line-soft bg-surface p-5 shadow-(--shadow-card)">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-ink-3">Daily notes</h2>
        <div className="flex items-center gap-3">
          {dirty ? (
            <Button small onClick={save}>Save</Button>
          ) : justSaved ? (
            <span className="text-xs text-accent-deep">✓ saved</span>
          ) : null}
          <button
            onClick={() => setExpanded(true)}
            aria-label="Expand to write"
            className="pressable text-ink-3 hover:text-ink-2"
          >
            <ExpandIcon />
          </button>
        </div>
      </div>

      <JournalFields {...fieldsProps} compact />

      <Sheet
        open={expanded}
        onClose={() => setExpanded(false)}
        title={`Daily notes — ${prettyDay(date)}`}
        wide
        cancelLabel="Close"
        primary={{ label: dirty ? "Save" : "Done", onClick: () => { if (dirty) save(); setExpanded(false); } }}
      >
        <JournalFields {...fieldsProps} compact={false} />
      </Sheet>
    </section>
  );
}

function JournalFields({
  rough, setRough, eod, setEod, showEod, setShowEod, roughMax, eodMax, mood, energy, onMood, onEnergy, compact,
}: {
  rough: string;
  setRough: (v: string) => void;
  eod: string;
  setEod: (v: string) => void;
  showEod: boolean;
  setShowEod: (v: boolean) => void;
  roughMax: number;
  eodMax: number;
  mood: number | null;
  energy: number | null;
  onMood: (v: number | null) => void;
  onEnergy: (v: number | null) => void;
  compact: boolean;
}) {
  return (
    <div className={compact ? "mt-3" : ""}>
      <textarea
        value={rough}
        maxLength={roughMax}
        onChange={(e) => setRough(e.target.value)}
        placeholder="Today I'm thinking about…"
        className={`w-full resize-y rounded-xl border border-line bg-bg px-3.5 py-3 text-[0.95rem] leading-relaxed text-ink placeholder:text-ink-3 outline-none focus:border-accent ${
          compact ? "min-h-32" : "min-h-64"
        }`}
      />
      {rough.length > roughMax * 0.9 && (
        <p className="mt-1 text-right text-xs text-ink-3 tabular-nums">{rough.length}/{roughMax}</p>
      )}

      {/* mood & energy */}
      <div className="mt-4 space-y-2.5">
        <ScaleRow label="Mood" icons={MOODS} value={mood} onChange={onMood} />
        <ScaleRow label="Energy" icons={ENERGY} value={energy} onChange={onEnergy} />
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
              className={`mt-2 w-full resize-y rounded-xl border border-line bg-bg px-3.5 py-3 text-[0.95rem] leading-relaxed text-ink placeholder:text-ink-3 outline-none focus:border-accent ${
                compact ? "min-h-24" : "min-h-48"
              }`}
            />
            {eod.length > eodMax * 0.9 && (
              <p className="mt-1 text-right text-xs text-ink-3 tabular-nums">{eod.length}/{eodMax}</p>
            )}
          </>
        )}
      </div>
    </div>
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

function ExpandIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2H2v4M10 14h4v-4M2 14l5-5M14 2l-5 5" />
    </svg>
  );
}
