"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLife } from "@/lib/data/provider";
import { prettyDay, shortDay, today } from "@/lib/dates";
import { todayEntries, TodayEntry } from "@/lib/progress";
import { Ring } from "@/components/progress";
import { EmptyState, inputCls } from "@/components/ui";

export default function TodayPage() {
  const { db, toggleEntry, addAction, deleteAction } = useLife();
  const [quick, setQuick] = useState("");
  const day = today();

  const entries = useMemo(() => todayEntries(db, day), [db, day]);
  const done = entries.filter((e) => e.action.done).length;
  const total = entries.length;

  const add = () => {
    if (!quick.trim()) return;
    addAction(quick, day);
    setQuick("");
  };

  return (
    <div className="rise-in lg:max-w-2xl">
      <header className="pt-6 pb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-ink-3">{prettyDay(day)}</p>
          <h1 className="font-display text-[2rem] leading-tight text-ink mt-1">Today</h1>
          {total > 0 && (
            <p className="text-sm text-ink-2 mt-2">
              {done === total
                ? "Everything done. Rest well."
                : `${total - done} small ${total - done === 1 ? "action" : "actions"} between you and a good day.`}
            </p>
          )}
        </div>
        {total > 0 && (
          <Ring
            value={done / total}
            size={92}
            stroke={8}
            label={`${done}/${total}`}
          />
        )}
      </header>

      {/* quick add */}
      <div className="flex gap-2 mb-6">
        <input
          className={inputCls}
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Add something for today…"
        />
      </div>

      {total === 0 ? (
        <EmptyState
          emoji="🌤"
          title="A clear day"
          body="Nothing planned yet. Add one small action above, or open a goal and break off a piece for today."
        >
          <Link href="/life" className="text-accent-deep font-medium text-sm">
            Browse your life →
          </Link>
        </EmptyState>
      ) : (
        <div className="space-y-2">
          {entries.map((e) => (
            <ActionRow
              key={e.action.id}
              entry={e}
              onToggle={() => toggleEntry(e)}
              onDelete={e.virtualHabit ? undefined : () => deleteAction(e.action.id)}
            />
          ))}
        </div>
      )}

      {done > 0 && done === total && total > 0 && (
        <p className="mt-8 text-center font-display text-lg text-accent-deep">
          Today moved you forward. 🌱
        </p>
      )}
    </div>
  );
}

function ActionRow({
  entry, onToggle, onDelete,
}: { entry: TodayEntry; onToggle: () => void; onDelete?: () => void }) {
  const { action, item, carriedFrom, virtualHabit, dayValue, dayTarget, scheduleLabel } = entry;
  const multi = dayTarget > 1;
  return (
    <div
      className={`group flex items-center gap-3 rounded-(--radius-card) border border-line-soft bg-surface px-4 py-3 shadow-(--shadow-card) transition-opacity ${
        action.done ? "opacity-60" : ""
      }`}
    >
      <button
        onClick={onToggle}
        aria-label={
          action.done ? "Undo" : multi ? `Log one (${dayValue} of ${dayTarget})` : "Mark done"
        }
        className={`pressable relative grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition-colors ${
          action.done ? "border-accent bg-accent text-white dark:text-[#10160f]" : "border-line hover:border-accent"
        }`}
      >
        {action.done ? (
          <svg className="bloom" width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6.5 4.8 9 10 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : multi && dayValue > 0 ? (
          <svg className="absolute inset-[-2px]" width="24" height="24" viewBox="0 0 24 24">
            <circle
              cx="12" cy="12" r="10" fill="none" stroke="var(--accent)" strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 10}
              strokeDashoffset={2 * Math.PI * 10 * (1 - Math.min(1, dayValue / dayTarget))}
              transform="rotate(-90 12 12)"
            />
          </svg>
        ) : null}
      </button>

      <div className="min-w-0 flex-1">
        {item ? (
          <Link
            href={`/item/${item.id}`}
            className={`block truncate text-[0.95rem] leading-snug ${action.done ? "text-ink-3 line-through decoration-ink-3/40" : "text-ink"}`}
          >
            {action.title}
          </Link>
        ) : (
          <span className={`block truncate text-[0.95rem] leading-snug ${action.done ? "text-ink-3 line-through decoration-ink-3/40" : "text-ink"}`}>
            {action.title}
          </span>
        )}
        <div className="flex gap-2 text-xs text-ink-3">
          {multi && (
            <span className="tabular-nums font-medium text-accent-deep">
              {Math.min(dayValue, dayTarget)}/{dayTarget}
              {item?.unit ? ` ${item.unit}` : ""}
            </span>
          )}
          {scheduleLabel && <span>{scheduleLabel}</span>}
          {virtualHabit && !scheduleLabel && <span>habit</span>}
          {carriedFrom && <span className="text-amber">carried from {shortDay(carriedFrom)}</span>}
        </div>
      </div>

      {onDelete && (
        <button
          onClick={onDelete}
          aria-label="Remove"
          className="text-ink-3 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity px-1"
        >
          ×
        </button>
      )}
    </div>
  );
}
