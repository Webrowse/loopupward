"use client";

import { useLife } from "@/lib/data/provider";
import { DEFAULT_WEEK_START } from "@/lib/types";
import { Card, inputCls } from "@/components/ui";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * One real setting, and nothing that only describes you.
 *
 * This card has lost, in order: a form asking who you are and what you are
 * becoming (an interview answer is the least reliable claim in an export, and
 * the journal and reflections already carry the same claims with dates on
 * them); a read-only timezone label (nobody needs to be shown their own
 * timezone, and it is now detected and kept in step automatically, so moving
 * shows up as a dated change instead of a stale label); and a "day rolls over
 * at" hour (a routine that should count for last night says so by having
 * visible hours that wrap past midnight, which is a fact about that routine
 * rather than a global rule about every hour of the day).
 *
 * What is left actually changes what the app does.
 */
export function ContextCard() {
  const { settings, updateSettings } = useLife();
  const weekStart = settings.weekStart ?? DEFAULT_WEEK_START;

  return (
    <Card className="p-5 mb-3">
      <p className="text-sm font-medium text-ink">Your week</p>
      <p className="mt-1 text-sm leading-relaxed text-ink-2">
        Which day a week begins on. This drives the day strip on Plan, the
        &ldquo;4&times; a week&rdquo; counters, every weekly review, and the week numbers in
        your export.
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-ink-2">Weeks start on</span>
        <select
          className={`${inputCls} w-40`}
          value={weekStart}
          onChange={(e) => updateSettings({ weekStart: Number(e.target.value) })}
        >
          {WEEKDAYS.map((d, i) => (
            <option key={d} value={i}>{d}</option>
          ))}
        </select>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-ink-3">
        Weeks run {WEEKDAYS[weekStart]} to {WEEKDAYS[(weekStart + 6) % 7]}.
        Changing this re-frames which seven days a past weekly review covers, so
        an old week number will line up with a slightly different week. Your
        export records the change and the day weeks start on, so nothing becomes
        unreadable.
      </p>
    </Card>
  );
}
