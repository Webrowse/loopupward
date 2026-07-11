"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLife } from "@/lib/data/provider";
import {
  addDays, isPeriod, nextAnchor, Period, periodKey, periodRange, prettyPeriod, previousAnchor, today,
} from "@/lib/dates";
import { computeReview } from "@/lib/review";
import { FREE_LIMITS } from "@/lib/limits";
import { areaColor } from "@/lib/palette";
import { formatValue } from "@/lib/progress";
import { Bar, Heatmap, Ring, StatTile } from "@/components/progress";
import { Button, EmptyState, Segmented } from "@/components/ui";

const PERIODS: { value: Period; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
];

export default function ReflectPage() {
  return (
    <Suspense fallback={null}>
      <Reflect />
    </Suspense>
  );
}

function Reflect() {
  const { db, premium, saveReflection, theme } = useLife();
  const params = useSearchParams();
  // arriving from "Reflect on this period" (Today's Week/Month/Quarter/Year
  // tabs) lands on that exact period, instead of always resetting to Week
  const paramPeriod = params.get("period");
  const paramDate = params.get("date");
  const [period, setPeriod] = useState<Period>(isPeriod(paramPeriod) ? paramPeriod : "week");
  const [anchor, setAnchor] = useState(paramDate || today());

  const locked = !premium && !FREE_LIMITS.periods.includes(period as "week" | "month");
  const review = useMemo(
    () => computeReview(db, period, anchor, today()),
    [db, period, anchor]
  );
  const key = periodKey(period, anchor);
  const reflection = db.reflections.find((r) => r.period === period && r.periodKey === key);

  const historyFloor = addDays(today(), -FREE_LIMITS.historyDays);
  const prevBlocked = !premium && periodRange(period, previousAnchor(period, anchor)).start < historyFloor;
  const atPresent = nextAnchor(period, anchor) > today();

  const heatCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of db.actions) if (a.done) m.set(a.date, (m.get(a.date) ?? 0) + 1);
    for (const l of db.logs) if (l.value > 0 && l.op === "add") m.set(l.date, (m.get(l.date) ?? 0) + 1);
    return m;
  }, [db.actions, db.logs]);

  const hasAnything = db.actions.length + db.logs.length > 0;

  return (
    <div className="rise-in lg:max-w-2xl">
      <header className="pt-6 pb-4">
        <p className="text-sm text-ink-3">Am I becoming better?</p>
        <h1 className="font-display text-[2rem] leading-tight text-ink mt-1">Reflect</h1>
      </header>

      <div className="flex items-center justify-between gap-2 mb-4">
        <Segmented options={PERIODS} value={period} onChange={(p) => { setPeriod(p); setAnchor(today()); }} />
        <Link href={`/today?view=${period}&date=${anchor}`} className="text-sm font-medium text-accent-deep">
          Plan ahead →
        </Link>
      </div>

      {locked ? (
        <EmptyState
          emoji="🔭"
          title={`${period === "quarter" ? "Quarterly" : "Yearly"} reviews are premium`}
          body="Zoom out over a whole quarter or year of your life: every book, workout, rupee and streak, compared season by season."
        >
          <Link href="/pricing"><Button>See premium</Button></Link>
        </EmptyState>
      ) : !hasAnything ? (
        <EmptyState
          emoji="🪞"
          title="Nothing to reflect on yet"
          body="Live a few days inside LoopUpward first: complete actions, log habits. Then this mirror starts talking back."
        >
          <Link href="/today" className="text-accent-deep font-medium text-sm">Start today →</Link>
        </EmptyState>
      ) : (
        <>
          {/* period navigation */}
          <div className="flex items-center justify-between mb-5">
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
            <p className="text-xs text-ink-3 -mt-3 mb-4 text-center">
              Free keeps {Math.round(FREE_LIMITS.historyDays / 7)} weeks of history.{" "}
              <Link href="/pricing" className="text-accent-deep font-medium">Premium keeps everything.</Link>
            </p>
          )}

          {/* headline */}
          <div className="flex items-center gap-5 rounded-(--radius-card) border border-line-soft bg-surface p-5 shadow-(--shadow-card) mb-3">
            <Ring
              value={review.consistency}
              size={104}
              stroke={9}
              label={`${Math.round(review.consistency * 100)}%`}
              sub="consistency"
            />
            <div className="flex-1">
              <p className="font-display text-lg text-ink leading-snug">
                {review.completed} of {review.planned} commitments kept
              </p>
              <p className="text-sm text-ink-2 mt-1">{compareLine(review.completed, review.previous.completed, period)}</p>
            </div>
          </div>

          {/* strongest / needs attention */}
          {review.areaScores.length > 0 && (
            <div className="grid grid-cols-2 gap-3 mb-3">
              <AreaScoreTile label="Strongest area" score={review.strongest} />
              <AreaScoreTile label="Needs attention" score={review.needsAttention} />
            </div>
          )}

          {/* wins */}
          {(review.booksFinished.length > 0 || review.goalsCompleted.length > 0) && (
            <div className="grid grid-cols-2 gap-3 mb-3">
              {review.booksFinished.length > 0 && (
                <StatTile label="Books finished" value={String(review.booksFinished.length)} sub={review.booksFinished[0].title} accent />
              )}
              {review.goalsCompleted.length > 0 && (
                <StatTile label="Goals achieved" value={String(review.goalsCompleted.length)} sub={review.goalsCompleted[0].title} accent />
              )}
            </div>
          )}

          {/* habits */}
          {review.habits.length > 0 && (
            <section className="rounded-(--radius-card) border border-line-soft bg-surface p-5 shadow-(--shadow-card) mb-3">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-3 mb-3">Habits</p>
              <div className="space-y-3">
                {review.habits.map((h) => {
                  const prev = review.previous.habitDays[h.item.id] ?? 0;
                  return (
                    <div key={h.item.id}>
                      <div className="flex items-baseline justify-between text-sm">
                        <Link href={`/item/${h.item.id}`} className="text-ink font-medium truncate">
                          {h.item.title}
                        </Link>
                        <span className="text-ink-2 tabular-nums shrink-0 ml-2">
                          {h.daysDone}/{h.daysPossible} days
                        </span>
                      </div>
                      <div className="mt-1.5">
                        <Bar value={h.daysPossible ? h.daysDone / h.daysPossible : 0} height={6} />
                      </div>
                      <p className="text-xs text-ink-3 mt-1">{compareLine(h.daysDone, prev, period, "days")}</p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* tracker movement */}
          {review.trackers.length > 0 && (
            <section className="rounded-(--radius-card) border border-line-soft bg-surface p-5 shadow-(--shadow-card) mb-3">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-3 mb-3">Movement</p>
              <div className="space-y-3">
                {review.trackers.map((t) => (
                  <div key={t.item.id} className="flex items-baseline justify-between gap-3 text-sm">
                    <Link href={`/item/${t.item.id}`} className="text-ink truncate">{t.item.title}</Link>
                    <span className="text-accent-deep font-medium tabular-nums shrink-0">
                      {t.item.tracker === "money" || t.item.tracker === "percent"
                        ? t.endValue !== null
                          ? `→ ${formatValue(t.item, t.endValue)}`
                          : `+${formatValue(t.item, t.added)}`
                        : `+${formatValue(t.item, t.added)}`}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* the human record: journal, mood, words */}
          {review.journal.daysWritten > 0 && (
            <section className="rounded-(--radius-card) border border-line-soft bg-surface p-5 shadow-(--shadow-card) mb-3">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-3 mb-3">
                In your own words
              </p>
              <p className="font-display text-lg text-ink leading-snug">
                You wrote on {review.journal.daysWritten}{" "}
                {review.journal.daysWritten === 1 ? "day" : "days"}
                {review.journal.topWords.length > 0 && (
                  <>. Your notes most often mentioned{" "}
                    <span className="text-accent-deep">{review.journal.topWords.join(", ")}</span>.
                  </>
                )}
              </p>
              {(review.journal.avgMood !== null || review.journal.avgEnergy !== null) && (
                <div className="mt-3 flex gap-5 text-sm text-ink-2">
                  {review.journal.avgMood !== null && (
                    <span>Mood {["😞", "😕", "😐", "🙂", "😄"][Math.round(review.journal.avgMood) - 1]} {review.journal.avgMood.toFixed(1)}/5</span>
                  )}
                  {review.journal.avgEnergy !== null && (
                    <span>Energy ⚡ {review.journal.avgEnergy.toFixed(1)}/5</span>
                  )}
                </div>
              )}
              <Link
                href={`/reflect/journal?period=${period}&date=${anchor}`}
                className="mt-3 inline-block text-sm font-medium text-accent-deep"
              >
                Read the entries →
              </Link>
            </section>
          )}

          {/* activity heatmap */}
          <section className="rounded-(--radius-card) border border-line-soft bg-surface p-5 shadow-(--shadow-card) mb-3">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-3 mb-3">
              Every day you showed up
            </p>
            <Heatmap counts={heatCounts} weeks={premium ? 20 : 12} />
          </section>

          {/* written reflection */}
          <section className="mb-6">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-3 mb-2">
              A note to future you
            </p>
            <textarea
              key={key}
              defaultValue={reflection?.text ?? ""}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v !== (reflection?.text ?? "")) saveReflection(period, key, v);
              }}
              placeholder="What did this period teach you?"
              className="w-full min-h-24 resize-none rounded-(--radius-card) border border-line bg-surface px-4 py-3 text-[0.95rem] text-ink placeholder:text-ink-3 outline-none focus:border-accent shadow-(--shadow-card)"
            />
            <p className="text-xs text-ink-3 mt-1">Saved automatically.</p>
          </section>
        </>
      )}
    </div>
  );
}

function AreaScoreTile({ label, score }: { label: string; score: { areaId: string | null; done: number; planned: number; rate: number } | null }) {
  const { db, theme } = useLife();
  if (!score) return null;
  const area = score.areaId ? db.areas.find((a) => a.id === score.areaId) : null;
  const c = areaColor(area?.color);
  return (
    <div className="rounded-(--radius-card) border border-line-soft bg-surface p-4 shadow-(--shadow-card)">
      <div className="text-xs font-medium uppercase tracking-wide text-ink-3">{label}</div>
      <div className="font-display text-lg text-ink mt-1 truncate">
        {area ? `${area.emoji} ${area.name}` : "Unfiled"}
      </div>
      <div className="mt-2">
        <Bar value={score.rate} color={theme === "dark" ? c.fgDark : c.fg} height={6} />
      </div>
      <div className="text-xs text-ink-3 mt-1 tabular-nums">
        {score.done}/{score.planned} kept
      </div>
    </div>
  );
}

function compareLine(cur: number, prev: number, period: Period, unit = ""): string {
  const label = { week: "last week", month: "last month", quarter: "last quarter", year: "last year" }[period];
  const u = unit ? ` ${unit}` : "";
  if (prev === 0 && cur === 0) return `Quiet so far. A single small action changes that.`;
  if (prev === 0) return `Up from zero ${label}. That's how change starts.`;
  if (cur > prev) return `${cur}${u} vs ${prev}${u} ${label}. Moving forward.`;
  if (cur === prev) return `Same as ${label} (${prev}${u}). Steady counts.`;
  return `${cur}${u} vs ${prev}${u} ${label}. Data, not failure.`;
}
