"use client";

import { useState } from "react";
import { useLife } from "@/lib/data/provider";
import { currentTimezone } from "@/lib/clock";
import { DEFAULT_DAY_ROLLOVER_HOUR, UserSettings } from "@/lib/types";
import { Card, inputCls } from "@/components/ui";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * The context that makes an export readable.
 *
 * Framed as what it is — the part of the file that says who the numbers belong
 * to — and never as configuration. Nothing here switches a feature on. Every
 * field is optional, blank is a perfectly good answer, and the copy says so
 * once rather than nagging per field: this is a page about data, not about
 * failing to fill in a form.
 */
export function ContextCard() {
  const { settings, updateSettings } = useLife();

  return (
    <>
      <Card className="p-5 mb-3">
        <p className="text-sm font-medium text-ink">Context included in your export</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">
          A year of tick marks is hard to read back. These few lines are what make it
          interpretable later — by you, or by whatever tool you hand the files to. All
          optional; leaving one blank costs nothing.
        </p>

        <div className="mt-4 space-y-3">
          <TextField
            label="What are you trying to become?"
            placeholder="Someone who finishes things"
            value={settings.becoming}
            onSave={(becoming) => updateSettings({ becoming })}
          />
          <TextField
            label="What season of life is this?"
            placeholder="First year of the business, new baby, final year of study…"
            value={settings.seasonOfLife}
            onSave={(seasonOfLife) => updateSettings({ seasonOfLife })}
          />
          <TextField
            label="What do you do?"
            placeholder="Backend engineer"
            value={settings.occupation}
            onSave={(occupation) => updateSettings({ occupation })}
          />
          <TextField
            label="What is genuinely in the way right now?"
            placeholder="Commute eats two hours; energy dies after 4pm"
            value={settings.constraints}
            onSave={(constraints) => updateSettings({ constraints })}
            multiline
          />
        </div>
      </Card>

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
              {settings.timezone !== currentTimezone() && currentTimezone() && (
                <button
                  onClick={() => updateSettings({ timezone: currentTimezone() })}
                  className="pressable rounded-full border border-line px-2.5 py-0.5 text-xs font-medium text-ink-2 hover:border-accent hover:text-accent-deep"
                >
                  Use {currentTimezone()}
                </button>
              )}
            </div>
          </Row>

          <Row label="Week starts on">
            <select
              className={`${inputCls} w-40`}
              value={settings.weekStart ?? 1}
              onChange={(e) => updateSettings({ weekStart: Number(e.target.value) })}
            >
              {WEEKDAYS.map((d, i) => (
                <option key={d} value={i}>{d}</option>
              ))}
            </select>
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

          <Row label="Usually awake">
            <div className="flex items-center gap-2">
              <TimeInput value={settings.wakeTime} onSave={(wakeTime) => updateSettings({ wakeTime })} />
              <span className="text-sm text-ink-3">to</span>
              <TimeInput value={settings.sleepTime} onSave={(sleepTime) => updateSettings({ sleepTime })} />
            </div>
          </Row>
        </div>
      </Card>

      <Card className="p-5 mb-3">
        <p className="text-sm font-medium text-ink">What you&rsquo;re aiming at</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">
          So the numbers in your export have something to be measured against. Setting none
          is fine — the counts stand on their own.
        </p>

        <div className="mt-4 space-y-3">
          <NumberField
            label="Focus minutes a day"
            value={settings.focusMinutesTarget}
            onSave={(focusMinutesTarget) => updateSettings({ focusMinutesTarget })}
          />
          <NumberField
            label="Habit days a week"
            max={7}
            value={settings.habitDaysTarget}
            onSave={(habitDaysTarget) => updateSettings({ habitDaysTarget })}
          />
          <NumberField
            label="Deep work days a week"
            max={7}
            value={settings.deepWorkDaysTarget}
            onSave={(deepWorkDaysTarget) => updateSettings({ deepWorkDaysTarget })}
          />
        </div>
      </Card>
    </>
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

/** Saves on blur, not per keystroke: one deliberate write for a sentence,
 *  the same rule the journal's text areas follow. */
function TextField({
  label, placeholder, value, onSave, multiline = false,
}: {
  label: string;
  placeholder: string;
  value: string | null;
  onSave: (v: string | null) => void;
  multiline?: boolean;
}) {
  const [draft, setDraft] = useState(value ?? "");
  const [last, setLast] = useState(value ?? "");
  if ((value ?? "") !== last) {
    setLast(value ?? "");
    setDraft(value ?? "");
  }
  const commit = () => {
    const next = draft.trim();
    if (next !== (value ?? "")) onSave(next || null);
  };
  return (
    <label className="block">
      <span className="text-xs text-ink-2">{label}</span>
      {multiline ? (
        <textarea
          className={`${inputCls} mt-1 min-h-20 resize-y`}
          value={draft}
          maxLength={4000}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
        />
      ) : (
        <input
          className={`${inputCls} mt-1`}
          value={draft}
          maxLength={4000}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
        />
      )}
    </label>
  );
}

function NumberField({
  label, value, max = 10_000, onSave,
}: {
  label: string;
  value: number | null;
  max?: number;
  onSave: (v: number | null) => void;
}) {
  const [draft, setDraft] = useState(value != null ? String(value) : "");
  const [last, setLast] = useState(value);
  if (value !== last) {
    setLast(value);
    setDraft(value != null ? String(value) : "");
  }
  return (
    <Row label={label}>
      <input
        type="number"
        min={0}
        max={max}
        className={`${inputCls} w-28 text-right`}
        value={draft}
        placeholder="none"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const trimmed = draft.trim();
          if (trimmed === "") {
            if (value !== null) onSave(null);
            return;
          }
          const n = Math.max(0, Math.min(max, Math.round(Number(trimmed))));
          if (Number.isFinite(n) && n !== value) onSave(n);
        }}
      />
    </Row>
  );
}

function TimeInput({ value, onSave }: { value: string | null; onSave: (v: string | null) => void }) {
  return (
    <input
      type="time"
      className={`${inputCls} w-32`}
      value={value ?? ""}
      onChange={(e) => onSave(e.target.value || null)}
    />
  );
}

/** Exported for the settings page's own use of the shape. */
export type { UserSettings };
