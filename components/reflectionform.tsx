"use client";

import { useState } from "react";
import { useLife } from "@/lib/data/provider";
import { Period } from "@/lib/dates";
import { IntentionScore } from "@/lib/review";
import { Intention, Reflection } from "@/lib/types";
import { uid } from "@/lib/uid";
import { Button, inputCls } from "@/components/ui";

const NEXT_LABEL: Record<Period, string> = {
  week: "next week",
  month: "next month",
  quarter: "next quarter",
  year: "next year",
};

/**
 * How the last period's promises actually went.
 *
 * Plain counting and nothing else: the item each intention named either moved
 * or it didn't, and by how much. An intention that named nothing countable is
 * shown as exactly that rather than being scored on a guess — "we can't say"
 * is honest, and a made-up verdict would be worse than silence.
 *
 * Tone matters here: this is a mirror, not a report card. A missed intention
 * reads as the number it is.
 */
export function PromisesKept({ promised, period }: { promised: IntentionScore[]; period: Period }) {
  if (promised.length === 0) return null;
  const kept = promised.filter((p) => p.met === true).length;
  const scorable = promised.filter((p) => p.met !== null).length;

  return (
    <section className="rounded-(--radius-card) border border-line-soft bg-surface p-5 shadow-(--shadow-card) mb-3">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-3 mb-3">
        What you said you&rsquo;d do
      </p>
      <p className="font-display text-lg leading-snug text-ink">
        {scorable === 0
          ? "Last time's intentions weren't tied to anything countable."
          : `${kept} of ${scorable} intentions kept.`}
      </p>
      <div className="mt-3 space-y-2.5">
        {promised.map((p) => (
          <div key={p.intention.id} className="flex items-start gap-2.5 text-sm">
            <span
              aria-hidden
              className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs ${
                p.met === null
                  ? "bg-surface-2 text-ink-3"
                  : p.met
                    ? "bg-accent-soft text-accent-deep"
                    : "bg-surface-2 text-ink-3"
              }`}
            >
              {p.met === null ? "–" : p.met ? "✓" : "·"}
            </span>
            <span className="min-w-0 flex-1">
              <span className={p.met === false ? "text-ink-2" : "text-ink"}>{p.intention.text}</span>
              <span className="block text-xs text-ink-3">
                {p.met === null
                  ? "no item named, so nothing to count"
                  : `${p.itemTitle}: ${p.achieved}${
                      p.intention.targetValue != null ? ` of ${p.intention.targetValue}` : ""
                    }${p.measure === "days" ? " days" : p.measure === "units" ? " logged" : ""}`}
              </span>
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ink-3">
        Counted, not judged. Data, not failure.
      </p>
    </section>
  );
}

/**
 * The written reflection, with the structure that lets the next period
 * measure itself against this one.
 *
 * Everything except the free text stays behind a disclosure: a person who
 * wants to write a paragraph and close the tab should be able to, exactly as
 * before. The intentions are the one part that earns its place — they are
 * what turns the next review from a report into a comparison.
 */
export function ReflectionForm({
  period, periodKey, reflection,
}: {
  period: Period;
  periodKey: string;
  reflection: Reflection | undefined;
}) {
  const { db, saveReflection } = useLife();
  const [text, setText] = useState(reflection?.text ?? "");
  const [open, setOpen] = useState(
    !!(reflection?.wins?.length || reflection?.lessons?.length || reflection?.blockers?.length || reflection?.intentions?.length || reflection?.ratings)
  );

  // switching period swaps everything under the cursor
  const [lastKey, setLastKey] = useState(periodKey);
  if (periodKey !== lastKey) {
    setLastKey(periodKey);
    setText(reflection?.text ?? "");
  }

  const save = (patch: Partial<Reflection>) => saveReflection(period, periodKey, patch);
  const ratings = reflection?.ratings ?? { overall: null, energy: null, progress: null };
  const intentions = reflection?.intentions ?? [];

  const setIntentions = (next: Intention[]) => save({ intentions: next });

  return (
    <section className="mb-6">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-3 mb-2">
        A note to future you
      </p>
      <textarea
        key={periodKey}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const v = text.trim();
          if (v !== (reflection?.text ?? "")) save({ text: v });
        }}
        placeholder="What did this period teach you?"
        className="w-full min-h-24 resize-none rounded-(--radius-card) border border-line bg-surface px-4 py-3 text-[0.95rem] text-ink placeholder:text-ink-3 outline-none focus:border-accent shadow-(--shadow-card)"
      />
      <p className="text-xs text-ink-3 mt-1">Saved automatically.</p>

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="pressable mt-3 text-sm font-medium text-accent-deep"
        >
          Add wins, lessons and what {NEXT_LABEL[period]} is for +
        </button>
      ) : (
        <div className="mt-4 space-y-5 rounded-(--radius-card) border border-line-soft bg-surface p-5 shadow-(--shadow-card)">
          <div className="space-y-2.5">
            <Rating label="Overall" value={ratings.overall} onChange={(overall) => save({ ratings: { ...ratings, overall } })} />
            <Rating label="Energy" value={ratings.energy} onChange={(energy) => save({ ratings: { ...ratings, energy } })} />
            <Rating label="Progress" value={ratings.progress} onChange={(progress) => save({ ratings: { ...ratings, progress } })} />
          </div>

          <Lines label="Wins" placeholder="Shipped the thing" value={reflection?.wins ?? []} onChange={(wins) => save({ wins })} />
          <Lines label="Lessons" placeholder="Mornings are the only time this works" value={reflection?.lessons ?? []} onChange={(lessons) => save({ lessons })} />
          <Lines label="Blockers" placeholder="Kept getting pulled into meetings" value={reflection?.blockers ?? []} onChange={(blockers) => save({ blockers })} />

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-3">
              What {NEXT_LABEL[period]} is for
            </p>
            <p className="mt-1 text-xs leading-relaxed text-ink-3">
              Name an item and a number, and next {period}&rsquo;s review will count whether it
              happened. Leave them off and it stays a note to yourself.
            </p>
            <div className="mt-2.5 space-y-2">
              {intentions.map((intent, i) => (
                <div key={intent.id} className="rounded-xl border border-line-soft bg-surface-2/40 p-2.5">
                  <div className="flex items-center gap-2">
                    <input
                      className={inputCls}
                      defaultValue={intent.text}
                      maxLength={1000}
                      placeholder="Run three times a week"
                      onBlur={(e) => {
                        const next = [...intentions];
                        next[i] = { ...intent, text: e.target.value.trim() };
                        if (next[i].text !== intent.text) setIntentions(next);
                      }}
                    />
                    <button
                      onClick={() => setIntentions(intentions.filter((x) => x.id !== intent.id))}
                      aria-label="Remove this intention"
                      className="pressable shrink-0 px-2 text-sm text-ink-3 hover:text-danger"
                    >
                      ×
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <select
                      className={`${inputCls} max-w-56 flex-1`}
                      value={intent.itemId ?? ""}
                      onChange={(e) => {
                        const next = [...intentions];
                        next[i] = { ...intent, itemId: e.target.value || null };
                        setIntentions(next);
                      }}
                    >
                      <option value="">not about one thing</option>
                      {db.items
                        .filter((it) => it.status === "active" && !it.deletedAt)
                        .slice(0, 300)
                        .map((it) => (
                          <option key={it.id} value={it.id}>{it.title}</option>
                        ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      className={`${inputCls} w-24 text-right`}
                      defaultValue={intent.targetValue ?? ""}
                      placeholder="how many"
                      onBlur={(e) => {
                        const raw = e.target.value.trim();
                        const v = raw === "" ? null : Math.max(0, Math.round(Number(raw)));
                        if (v !== intent.targetValue && (v === null || Number.isFinite(v))) {
                          const next = [...intentions];
                          next[i] = { ...intent, targetValue: v };
                          setIntentions(next);
                        }
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <Button
              small
              variant="soft"
              onClick={() => setIntentions([...intentions, { id: uid(), text: "", itemId: null, targetValue: null }])}
            >
              + Add an intention
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function Rating({
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
                ? "bg-accent-soft scale-110 font-medium text-accent-deep"
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

/** A short list of one-liners. Editing the last (empty) row grows the list,
 *  so there is never an "add" button to hunt for. */
function Lines({
  label, placeholder, value, onChange,
}: {
  label: string;
  placeholder: string;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const rows = [...value, ""];
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-3">{label}</p>
      <div className="mt-2 space-y-1.5">
        {rows.map((line, i) => (
          <input
            key={`${label}-${i}`}
            className={inputCls}
            defaultValue={line}
            maxLength={1000}
            placeholder={i === rows.length - 1 ? placeholder : ""}
            onBlur={(e) => {
              const next = [...value];
              const text = e.target.value.trim();
              if (i < value.length) {
                if (text) next[i] = text;
                else next.splice(i, 1);
              } else if (text) {
                next.push(text);
              } else {
                return;
              }
              if (next.join(" ") !== value.join(" ")) onChange(next);
            }}
          />
        ))}
      </div>
    </div>
  );
}
