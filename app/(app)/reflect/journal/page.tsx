"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLife } from "@/lib/data/provider";
import {
  addDays, isPeriod, nextAnchor, Period, periodKey, periodRange, prettyDay, prettyPeriod,
  previousAnchor, today,
} from "@/lib/dates";
import { FREE_LIMITS } from "@/lib/limits";
import { journalEntriesInRange, journalToCsv, downloadTextFile } from "@/lib/journalExport";
import { MOODS, ENERGY } from "@/components/journal";
import { BackLink, Button, EmptyState, Segmented } from "@/components/ui";

const PERIODS: { value: Period; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
];

export default function JournalPage() {
  return (
    <Suspense fallback={null}>
      <Journal />
    </Suspense>
  );
}

function Journal() {
  const { db, premium } = useLife();
  const params = useSearchParams();
  const paramPeriod = params.get("period");
  const paramDate = params.get("date");
  const [period, setPeriod] = useState<Period>(isPeriod(paramPeriod) ? paramPeriod : "week");
  const [anchor, setAnchor] = useState(paramDate || today());

  const locked = !premium && !FREE_LIMITS.periods.includes(period as "week" | "month");
  const { start, end } = periodRange(period, anchor);
  const entries = useMemo(() => journalEntriesInRange(db, start, end), [db, start, end]);
  const key = periodKey(period, anchor);

  const historyFloor = addDays(today(), -FREE_LIMITS.historyDays);
  const prevBlocked = !premium && periodRange(period, previousAnchor(period, anchor)).start < historyFloor;
  const atPresent = nextAnchor(period, anchor) > today();

  const downloadCsv = () => {
    downloadTextFile(`loopupward-journal-${key}.csv`, journalToCsv(entries), "text/csv");
  };

  return (
    <div className="rise-in lg:max-w-2xl">
      <div className="no-print pt-2">
        <BackLink fallback="/reflect" label="Reflect" />
      </div>

      <header className="no-print pt-4 pb-4">
        <p className="text-sm text-ink-3">In your own words</p>
        <h1 className="font-display text-[2rem] leading-tight text-ink mt-1">Journal</h1>
      </header>

      <div className="no-print flex items-center justify-between gap-2 mb-4">
        <Segmented options={PERIODS} value={period} onChange={(p) => { setPeriod(p); setAnchor(today()); }} />
      </div>

      {locked ? (
        <EmptyState
          emoji="🔭"
          title={`${period === "quarter" ? "Quarterly" : "Yearly"} journals are premium`}
          body="Read back over a whole season or year of your own words, and download the collection whenever you like."
        >
          <Link href="/pricing"><Button>See premium</Button></Link>
        </EmptyState>
      ) : (
        <>
          <div className="no-print flex items-center justify-between mb-3">
            <button
              className="pressable px-3 py-1 text-ink-2 disabled:opacity-30"
              disabled={prevBlocked}
              aria-label={`Previous ${period}`}
              onClick={() => setAnchor(previousAnchor(period, anchor))}
            >
              ‹
            </button>
            <span className="font-medium text-ink text-sm">{prettyPeriod(period, anchor)}</span>
            <button
              className="pressable px-3 py-1 text-ink-2 disabled:opacity-30"
              disabled={atPresent}
              aria-label={`Next ${period}`}
              onClick={() => setAnchor(nextAnchor(period, anchor))}
            >
              ›
            </button>
          </div>
          {prevBlocked && (
            <p className="no-print text-xs text-ink-3 -mt-2 mb-4 text-center">
              Free keeps {Math.round(FREE_LIMITS.historyDays / 7)} weeks of history.{" "}
              <Link href="/pricing" className="text-accent-deep font-medium">Premium keeps everything.</Link>
            </p>
          )}

          <div className="no-print mb-6 flex items-center gap-3">
            {premium ? (
              <>
                <Button small variant="soft" onClick={downloadCsv} disabled={entries.length === 0}>
                  Download CSV
                </Button>
                <Button small variant="soft" onClick={() => window.print()} disabled={entries.length === 0}>
                  Save as PDF
                </Button>
              </>
            ) : (
              <p className="text-xs text-ink-3">
                Downloads are a premium feature.{" "}
                <Link href="/pricing" className="text-accent-deep font-medium">Upgrade →</Link>
              </p>
            )}
          </div>
          {premium && entries.length > 0 && (
            <p className="no-print -mt-4 mb-6 text-xs text-ink-3">
              &ldquo;Save as PDF&rdquo; opens your browser&apos;s print dialog. Choose &ldquo;Save as PDF&rdquo; as the destination.
            </p>
          )}

          {entries.length === 0 ? (
            <EmptyState
              emoji="🪶"
              title="Nothing written this period"
              body="Whatever you write in Today's daily notes shows up here, collected and readable."
            />
          ) : (
            <div>
              <p className="hidden print:block font-display text-xl mb-4">
                LoopUpward Journal: {prettyPeriod(period, anchor)}
              </p>
              {entries.map((e) => (
                <article key={e.id} className="border-b border-line-soft py-5 first:pt-0 last:border-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="font-display text-lg text-ink">{prettyDay(e.date)}</h2>
                    {(e.mood != null || e.energy != null) && (
                      <div className="flex shrink-0 gap-2 text-sm text-ink-3">
                        {e.mood != null && <span>{MOODS[e.mood - 1]}</span>}
                        {e.energy != null && <span>{ENERGY[e.energy - 1]}</span>}
                      </div>
                    )}
                  </div>
                  {e.roughNotes.trim() && (
                    <p className="mt-2 whitespace-pre-wrap text-[0.95rem] leading-relaxed text-ink-2">
                      {e.roughNotes}
                    </p>
                  )}
                  {e.endOfDay.trim() && (
                    <div className="mt-3 border-t border-line-soft pt-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-ink-3">End of day</p>
                      <p className="mt-1 whitespace-pre-wrap text-[0.95rem] leading-relaxed text-ink-2">
                        {e.endOfDay}
                      </p>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
