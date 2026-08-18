"use client";

import { useLife } from "@/lib/data/provider";
import { currentTimezone } from "@/lib/clock";
import { DEFAULT_DAY_ROLLOVER_HOUR } from "@/lib/types";
import { Card, inputCls } from "@/components/ui";

/**
 * The clock, and nothing else.
 *
 * This card used to ask who you are: what you are becoming, what season of
 * life this is, what is in the way, how many focus minutes a day you are
 * aiming at. All of it fed one section of the export, and all of it was a form
 * asking a person to describe themselves so that a reader would not have to
 * work it out.
 *
 * That is the wrong trade. What someone says about themselves in a settings
 * form is the least reliable thing in the bundle, and the export already
 * carries the same claims made where they mean something: the day's one
 * intention, a reflection's wins and blockers, the promises a period sets for
 * the next one, the areas a life was actually divided into. Those are stated
 * priorities captured in the flow of living rather than in an interview, and
 * they are dated, which a standing self-description never is.
 *
 * What remains here is not self-description. A timezone and a rollover hour
 * are mechanics: without them no exported timestamp can be placed, and the
 * question "which day does a 1am tick belong to" has no answer.
 */
export function ContextCard() {
  const { settings, updateSettings } = useLife();
  const browserZone = currentTimezone();

  return (
    <Card className="p-5 mb-3">
      <p className="text-sm font-medium text-ink">Your clock</p>
      <p className="mt-1 text-sm leading-relaxed text-ink-2">
        How your day is actually shaped. Without a timezone, no exported timestamp can be
        read across travel or a daylight-saving change.
      </p>

      <div className="mt-4 space-y-3">
        <Row label="Timezone">
          <div className="flex items-center gap-2">
            <span className="text-sm tabular-nums text-ink">
              {settings.timezone ?? "not set"}
            </span>
            {settings.timezone !== browserZone && browserZone && (
              <button
                onClick={() => updateSettings({ timezone: browserZone })}
                className="pressable rounded-full border border-line px-2.5 py-0.5 text-xs font-medium text-ink-2 hover:border-accent hover:text-accent-deep"
              >
                Use {browserZone}
              </button>
            )}
          </div>
        </Row>

        <Row label="A day rolls over at">
          <select
            className={`${inputCls} w-40`}
            value={settings.dayRolloverHour ?? DEFAULT_DAY_ROLLOVER_HOUR}
            onChange={(e) => updateSettings({ dayRolloverHour: Number(e.target.value) })}
          >
            {[0, 1, 2, 3, 4, 5, 6].map((h) => (
              <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
            ))}
          </select>
        </Row>
        <p className="text-xs leading-relaxed text-ink-3">
          Before this hour you are still living the night before, so a routine finished at
          1am counts for yesterday rather than leaking into today.
        </p>

        <Row label="Weeks run">
          <span className="text-sm text-ink">Monday to Sunday</span>
        </Row>
        <p className="text-xs leading-relaxed text-ink-3">
          Fixed, not a preference: every week in the app and in your export starts on a
          Monday, so a week number always means the same thing.
        </p>
      </div>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-sm text-ink-2">{label}</span>
      {children}
    </div>
  );
}
