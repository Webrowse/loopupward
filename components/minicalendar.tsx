"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addDays, addMonths, addYears, fromDay, startOfMonth, startOfWeek } from "@/lib/dates";
import { useToday } from "@/lib/useToday";

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const DOW_LETTER = ["M", "T", "W", "T", "F", "S", "S"];

function ArrowButton({ label, onClick, double }: { label: string; onClick: () => void; double?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="pressable grid h-5 w-5 shrink-0 place-items-center rounded text-ink-3 hover:bg-surface-2 hover:text-ink"
    >
      <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {double ? (
          label.startsWith("Previous") ? (
            <path d="M7 1 3 5l4 4M4 1 0 5l4 4" />
          ) : (
            <path d="M3 1 7 5l-4 4M6 1l4 4-4 4" />
          )
        ) : label.startsWith("Previous") ? (
          <path d="M6.5 1 2.5 5l4 4" />
        ) : (
          <path d="M3.5 1 7.5 5l-4 4" />
        )}
      </svg>
    </button>
  );
}

/** Sidebar date-jumper: cross months or years to land on any day, past or
 *  future, without paging through Today's week strip one step at a time. */
export function MiniCalendar() {
  const router = useRouter();
  const realToday = useToday();
  // null = "not manually browsing" — tracks the current month on its own as
  // realToday corrects itself (see useToday) or rolls over past midnight
  const [manualViewMonth, setManualViewMonth] = useState<string | null>(null);
  const viewMonth = manualViewMonth ?? startOfMonth(realToday);

  const d = fromDay(viewMonth);
  const year = d.getFullYear();
  const monthIdx = d.getMonth();
  const gridStart = startOfWeek(viewMonth);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  const goToDay = (day: string) => {
    router.push(`/today?day=${day}`);
  };

  return (
    <div className="mt-4 rounded-xl border border-line-soft bg-surface p-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <ArrowButton label="Previous year" double onClick={() => setManualViewMonth(addYears(viewMonth, -1))} />
        <ArrowButton label="Previous month" onClick={() => setManualViewMonth(addMonths(viewMonth, -1))} />
        <button
          onClick={() => setManualViewMonth(null)}
          className="pressable text-xs font-medium text-ink hover:text-accent-deep"
        >
          {MONTH_SHORT[monthIdx]} {year}
        </button>
        <ArrowButton label="Next month" onClick={() => setManualViewMonth(addMonths(viewMonth, 1))} />
        <ArrowButton label="Next year" double onClick={() => setManualViewMonth(addYears(viewMonth, 1))} />
      </div>

      <div className="grid grid-cols-7 gap-y-0.5">
        {DOW_LETTER.map((l, i) => (
          <span key={i} className="grid h-5 place-items-center text-[10px] text-ink-3">{l}</span>
        ))}
        {cells.map((day) => {
          const inMonth = day.slice(0, 7) === viewMonth.slice(0, 7);
          const isToday = day === realToday;
          return (
            <button
              key={day}
              onClick={() => goToDay(day)}
              className={`pressable grid h-6 place-items-center rounded-md text-[11px] tabular-nums transition-colors ${
                isToday
                  ? "bg-accent text-white dark:text-[#10160f] font-medium"
                  : inMonth
                    ? "text-ink hover:bg-surface-2"
                    : "text-ink-3/50 hover:bg-surface-2"
              }`}
            >
              {Number(day.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
