"use client";

import { ComponentType, useState } from "react";
import { useLife } from "@/lib/data/provider";
import { prettyDay } from "@/lib/dates";
import { JournalEntry } from "@/lib/types";
import { ENERGY_ICONS, MOOD_ICONS } from "./icons";
import { Button, Sheet, inputCls } from "./ui";

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
    entry,
    onExtra: (patch: Partial<JournalEntry>) => saveJournal(date, patch),
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
        title={`Daily notes: ${prettyDay(date)}`}
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
  rough, setRough, eod, setEod, showEod, setShowEod, roughMax, eodMax, mood, energy, onMood, onEnergy,
  entry, onExtra, compact,
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
  entry: JournalEntry | undefined;
  onExtra: (patch: Partial<JournalEntry>) => void;
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
        <ScaleRow label="Mood" icons={MOOD_ICONS} value={mood} onChange={onMood} />
        <ScaleRow label="Energy" icons={ENERGY_ICONS} value={energy} onChange={onEnergy} />
      </div>

      {/* the quiet half of a day, behind a disclosure so the daily loop
          stays exactly as short as it already was */}
      <MoreAboutToday entry={entry} onChange={onExtra} compact={compact} />

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

/**
 * Sleep, stress, focus, the one thing that would have made today good, and
 * what you were grateful for.
 *
 * Every field is optional and the whole block starts closed: a person who
 * wants to write two lines and get on with their life must not be made to
 * scroll past six inputs they will never fill. Nothing here nags about being
 * empty, and nothing here is required for anything else to work — these are
 * the columns that make a year of daily.csv worth reading later.
 */
function MoreAboutToday({
  entry, onChange, compact,
}: {
  entry: JournalEntry | undefined;
  onChange: (patch: Partial<JournalEntry>) => void;
  compact: boolean;
}) {
  const filled =
    entry?.sleepHours != null || entry?.sleepQuality != null || entry?.stress != null ||
    entry?.focus != null || !!entry?.gratitude?.trim() || !!entry?.intention?.trim();
  const [open, setOpen] = useState(filled);
  const [intention, setIntention] = useState(entry?.intention ?? "");
  const [gratitude, setGratitude] = useState(entry?.gratitude ?? "");
  const [sleep, setSleep] = useState(entry?.sleepHours != null ? String(entry.sleepHours) : "");

  // switching days (or loading a saved entry) swaps the text under the cursor
  const [lastId, setLastId] = useState(entry?.id ?? null);
  if ((entry?.id ?? null) !== lastId) {
    setLastId(entry?.id ?? null);
    setIntention(entry?.intention ?? "");
    setGratitude(entry?.gratitude ?? "");
    setSleep(entry?.sleepHours != null ? String(entry.sleepHours) : "");
  }

  if (!open) {
    return (
      <div className="mt-4">
        <button
          onClick={() => setOpen(true)}
          className="pressable text-sm font-medium text-ink-3 hover:text-ink-2"
        >
          Add more about today +
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-line-soft bg-surface-2/40 p-3.5">
      <p className="text-xs leading-relaxed text-ink-3">
        All optional. These are the details that make this day readable again in a year,
        or in your export.
      </p>

      <label className="block">
        <span className="text-xs text-ink-2">One thing that would make today good</span>
        <input
          className={`${inputCls} mt-1`}
          value={intention}
          maxLength={2000}
          onChange={(e) => setIntention(e.target.value)}
          onBlur={() => { if (intention !== (entry?.intention ?? "")) onChange({ intention }); }}
          placeholder="Finish the draft"
        />
      </label>

      <label className="block">
        <span className="text-xs text-ink-2">Grateful for</span>
        <input
          className={`${inputCls} mt-1`}
          value={gratitude}
          maxLength={2000}
          onChange={(e) => setGratitude(e.target.value)}
          onBlur={() => { if (gratitude !== (entry?.gratitude ?? "")) onChange({ gratitude }); }}
          placeholder="A slow morning"
        />
      </label>

      <label className="flex items-center justify-between gap-3">
        <span className="text-sm text-ink-2">Hours slept</span>
        <input
          type="number"
          min={0}
          max={24}
          step={0.5}
          className={`${inputCls} w-24 text-right`}
          value={sleep}
          onChange={(e) => setSleep(e.target.value)}
          onBlur={() => {
            const v = sleep.trim() === "" ? null : Math.max(0, Math.min(24, parseFloat(sleep)));
            if (v !== (entry?.sleepHours ?? null) && !Number.isNaN(v)) onChange({ sleepHours: v });
          }}
        />
      </label>

      <NumberScale label="Sleep quality" value={entry?.sleepQuality ?? null} onChange={(v) => onChange({ sleepQuality: v })} />
      <NumberScale label="Stress" value={entry?.stress ?? null} onChange={(v) => onChange({ stress: v })} />
      <NumberScale label="Focus" value={entry?.focus ?? null} onChange={(v) => onChange({ focus: v })} />

      {!compact && (
        <p className="text-xs leading-relaxed text-ink-3">
          Blank stays blank. An unrated day is recorded as unrated, never as a zero.
        </p>
      )}
    </div>
  );
}

/** A plain 1–5 row for the fields that have no icon set of their own. */
function NumberScale({
  label, value, onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-ink-2">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            onClick={() => onChange(value === v ? null : v)}
            aria-label={`${label} ${v} of 5`}
            aria-pressed={value === v}
            className={`pressable grid h-8 w-8 place-items-center rounded-full text-sm tabular-nums transition-all ${
              value === v
                ? "bg-accent-soft scale-110 text-accent-deep font-medium"
                : value !== null ? "text-ink-3 opacity-50" : "text-ink-2 opacity-70 hover:opacity-100"
            }`}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

function ScaleRow({
  label, icons, value, onChange,
}: {
  label: string;
  icons: ComponentType<{ className?: string }>[];
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-ink-2">{label}</span>
      <div className="flex gap-1">
        {icons.map((Icon, i) => {
          const v = i + 1;
          const active = value === v;
          return (
            <button
              key={v}
              onClick={() => onChange(active ? null : v)}
              aria-label={`${label} ${v} of 5`}
              className={`pressable grid h-8 w-8 place-items-center rounded-full transition-all ${
                active
                  ? "bg-accent-soft scale-110 text-accent-deep"
                  : value !== null ? "opacity-40 text-ink-2" : "opacity-70 hover:opacity-100 text-ink-2"
              }`}
            >
              <Icon className="h-[18px] w-[18px]" />
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
