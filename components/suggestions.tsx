"use client";

import { useState } from "react";
import { useLife } from "@/lib/data/provider";
import { Suggestion, SUGGESTIONS } from "@/lib/suggestions";
import { today } from "@/lib/dates";
import { Chip, Sheet } from "@/components/ui";

/**
 * A shelf of borrowable targets. Every entry is already shaped for the app:
 * one-time things land on Today as a task, repeats arrive as habits with
 * their schedule set, bigger ones arrive as goals on the right horizon —
 * so borrowing one also quietly demonstrates how the model works.
 */
export function SuggestionsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addAction, addItem } = useLife();
  const [group, setGroup] = useState(0);
  const [added, setAdded] = useState<Set<string>>(new Set());

  const add = (s: Suggestion) => {
    if (added.has(s.title)) return;
    if (!s.kind) {
      addAction(s.title, today());
    } else {
      addItem({
        title: s.title,
        kind: s.kind,
        tracker: s.tracker ?? (s.kind === "habit" || s.kind === "routine" ? "habit" : "check"),
        cadence: s.cadence ?? null,
        cadenceDays: s.cadenceDays ?? null,
        cadenceCount: s.cadenceCount ?? null,
        horizon: s.horizon ?? null,
        horizonPeriod: s.horizon && s.horizon !== "someday" && s.horizon !== "today" ? today() : null,
        target: s.target ?? null,
        unit: s.unit ?? null,
      });
    }
    setAdded((prev) => new Set(prev).add(s.title));
  };

  const describe = (s: Suggestion): string => {
    if (!s.kind) return "today, once";
    if (s.kind === "routine") return "a routine — you write the steps";
    if (s.cadence === "daily") return s.target && s.target > 1 ? `every day, ${s.target}×` : "every day";
    if (s.cadence === "weekly") return `${s.cadenceCount}× a week`;
    if (s.cadence === "days") return "every Sunday";
    if (s.horizon === "quarter") return "a goal for this quarter";
    if (s.horizon === "month") return "a goal for this month";
    return "a goal";
  };

  return (
    <Sheet open={open} onClose={onClose} title="Borrow a target" wide>
      <p className="mb-3 text-sm leading-relaxed text-ink-2">
        Small, concrete, already shaped — one-time things land on Today, repeats
        become habits with their schedule set, bigger ones become goals.
      </p>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((g, i) => (
          <Chip key={g.label} active={group === i} onClick={() => setGroup(i)}>
            {g.emoji} {g.label}
          </Chip>
        ))}
      </div>
      <div className="divide-y divide-line-soft rounded-(--radius-card) border border-line-soft bg-surface">
        {SUGGESTIONS[group].items.map((s) => {
          const done = added.has(s.title);
          return (
            <div key={s.title} className="flex items-center gap-3 px-3.5 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink leading-snug">{s.title}</p>
                <p className="text-xs text-ink-3">{describe(s)}</p>
              </div>
              <button
                onClick={() => add(s)}
                disabled={done}
                className={`pressable shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  done
                    ? "border-accent-soft bg-accent-soft text-accent-deep"
                    : "border-line bg-surface text-ink-2 hover:border-accent"
                }`}
              >
                {done ? "✓ added" : "+ Add"}
              </button>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}

/** The quiet one-line invitation that opens the shelf. */
export function SuggestionsLink({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`pressable text-sm font-medium text-accent-deep ${className}`}
      >
        Out of ideas? Borrow a target →
      </button>
      <SuggestionsSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
