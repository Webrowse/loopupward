"use client";

import { useMemo, useState } from "react";
import { useLife } from "@/lib/data/provider";
import { addDays, periodRange, startOfMonth, today as todayStr } from "@/lib/dates";
import type { ExportWindow } from "@/lib/export/window";
import { readLocalStreams } from "@/lib/data/streams";
import { spanOf } from "@/lib/stats";
import { EMPTY_STREAMS } from "@/lib/types";
import { collectBundleInput, downloadBundle, prettyBytes, previewBundle } from "@/lib/export/download";
import { Button, Card, Segmented, inputCls } from "@/components/ui";

/** What is in the bundle, in the order the reader meets it. Written out
 *  rather than derived, because the point of this list is to say what each
 *  file is FOR, which the file names alone cannot. */
const CONTENTS: { group: string; files: { name: string; what: string }[] }[] = [
  {
    group: "To read first",
    files: [
      { name: "README.md", what: "what every file and every column means, written for someone who has never seen this app" },
      { name: "manifest.json", what: "what the record can and cannot know: when each kind of record starts, and which timestamps are exact" },
      { name: "context.md", what: "your timezone, when your day rolls over, and what each area of your life is for" },
      { name: "summary.md", what: "the computed numbers, formatted to read" },
    ],
  },
  {
    group: "The raw record",
    files: [
      { name: "items.csv", what: "every goal, habit, note and project, with its area, horizon and progress" },
      { name: "actions.csv", what: "every task, when it was planned for, and when it was actually done" },
      { name: "logs.csv", what: "every unit of progress, and how it got there" },
      { name: "focus_sessions.csv", what: "every timer attempt: planned versus actual, pauses, and how it ended" },
      { name: "habit_days.csv", what: "what each habit meant on each day, and whether the day counted" },
      { name: "routine_steps.csv", what: "each routine step per day, with the time and order you really did them" },
      { name: "schedule_expectations.csv", what: "what was supposed to happen each day, next to what did — so a missed day is a row, not an absence" },
      { name: "daily.csv", what: "one row per day, everything paired up and nothing interpreted" },
      { name: "events.ndjson", what: "the full behavioural log, one line per thing that happened" },
      { name: "areas.csv, labels.csv, seeds.csv, list_entries.csv, day_order.csv", what: "the rest, in full" },
    ],
  },
  {
    group: "Your words",
    files: [
      { name: "journal.md", what: "every daily entry, in order, including when it was written" },
      { name: "reflections.md", what: "every period reflection, and whether its intentions were met" },
      { name: "notes.md", what: "your notes, as markdown" },
      { name: "journal.csv, reflections.csv, notes.csv", what: "the same entries with their ids and timestamps, for joining" },
      { name: "raw.json", what: "every table exactly as stored, in case a CSV lost some nuance" },
    ],
  },
];

/**
 * The export, made concrete before it is asked for.
 *
 * "Export everything" as a lone button asks the user to trust that something
 * useful is behind it. This says what is in the bundle, how much of it there
 * is, and what span of their life it covers — and then hands it over in one
 * file with no account, no upload and no service in the middle.
 */
type Scope = "all" | "week" | "month" | "custom";

/** The stretch a scoped download covers. Null means the whole life. */
function windowFor(scope: Scope, from: string, to: string): ExportWindow | null {
  const t = todayStr();
  if (scope === "all") return null;
  if (scope === "week") {
    const { start, end } = periodRange("week", t);
    return { start, end, label: "the current week" };
  }
  if (scope === "month") {
    return { start: startOfMonth(t), end: t, label: "the current month so far" };
  }
  const [start, end] = from <= to ? [from, to] : [to, from];
  return { start, end, label: "a chosen range" };
}

export function ExportCard() {
  const { db, mode, user, settings, flushStreams } = useLife();
  const [scope, setScope] = useState<Scope>("all");
  const [from, setFrom] = useState(() => addDays(todayStr(), -30));
  const [to, setTo] = useState(() => todayStr());
  const window = useMemo(() => windowFor(scope, from, to), [scope, from, to]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [built, setBuilt] = useState<{ files: number; bytes: number } | null>(null);
  const [showFiles, setShowFiles] = useState(false);

  // signed-out, the streams are right here; signed in they live on the server
  // and are fetched only when the bundle is actually built
  const localStreams = mode === "local" ? readLocalStreams() : EMPTY_STREAMS;
  const span = spanOf(db, localStreams);

  const rows: { label: string; n: number }[] = [
    { label: "items", n: db.items.length },
    { label: "tasks", n: db.actions.length },
    { label: "progress entries", n: db.logs.length },
    { label: "journal days", n: db.journal.length },
    { label: "reflections", n: db.reflections.length },
    { label: "captures", n: db.seeds.length },
  ];
  if (mode === "local") {
    rows.push(
      { label: "focus sessions", n: localStreams.focusSessions.length },
      { label: "recorded events", n: localStreams.events.length }
    );
  }

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      // anything still buffered belongs in this bundle: finishing a routine and
      // immediately exporting must not leave that routine out of the file
      await flushStreams();
      const input = await collectBundleInput({
        mode,
        settings,
        email: user?.email ?? null,
        window,
      });
      const preview = previewBundle(input);
      downloadBundle(preview.files, input.generatedAt, window);
      setBuilt({ files: preview.files.length, bytes: preview.totalBytes });
    } catch (e) {
      console.error("[lifeos] export failed", e);
      setError(
        mode === "cloud"
          ? "Couldn't reach your cloud to build the export. Check your connection and try again."
          : "Something went wrong building the export."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5 mb-3">
      <p className="text-sm font-medium text-ink">Your data is yours</p>
      <p className="mt-1 text-sm leading-relaxed text-ink-2">
        One download: a folder of plain files you can read yourself, open in a spreadsheet,
        or hand to any tool you like. It is built here, in this browser.{" "}
        <strong className="font-medium text-ink">The app never sends it anywhere.</strong>
      </p>

      {span && (
        <p className="mt-3 text-sm text-ink-2">
          Covering <span className="font-medium text-ink">{span.start}</span> to{" "}
          <span className="font-medium text-ink">{span.end}</span>.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {rows.map((r) => (
          <span key={r.label} className="text-sm text-ink-3 tabular-nums">
            <span className="font-medium text-ink-2">{r.n.toLocaleString()}</span> {r.label}
          </span>
        ))}
      </div>

      <button
        onClick={() => setShowFiles((v) => !v)}
        aria-expanded={showFiles}
        className="pressable mt-3 text-sm font-medium text-accent-deep"
      >
        {showFiles ? "Hide what's inside" : "See what's inside"}
      </button>

      {showFiles && (
        <div className="mt-3 space-y-4 rounded-xl border border-line-soft bg-surface-2/40 p-3.5">
          {CONTENTS.map((group) => (
            <div key={group.group}>
              <p className="text-xs font-medium uppercase tracking-wide text-ink-3">{group.group}</p>
              <ul className="mt-1.5 space-y-1.5">
                {group.files.map((f) => (
                  <li key={f.name} className="text-sm leading-relaxed text-ink-2">
                    <code className="text-[0.8rem] text-ink">{f.name}</code>
                    <span className="text-ink-3"> — {f.what}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-3">How much</p>
        <div className="mt-2">
          <Segmented
            options={[
              { value: "all", label: "Everything" },
              { value: "week", label: "This week" },
              { value: "month", label: "This month" },
              { value: "custom", label: "Range" },
            ]}
            value={scope}
            onChange={(v) => setScope(v as Scope)}
          />
        </div>
        {scope === "custom" && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <input
              type="date"
              aria-label="From"
              className={`${inputCls} w-40`}
              value={from}
              max={to}
              onChange={(e) => e.target.value && setFrom(e.target.value)}
            />
            <span className="text-sm text-ink-3">to</span>
            <input
              type="date"
              aria-label="To"
              className={`${inputCls} w-40`}
              value={to}
              min={from}
              onChange={(e) => e.target.value && setTo(e.target.value)}
            />
          </div>
        )}
        <p className="mt-2 text-xs leading-relaxed text-ink-3">
          {window
            ? `Covering ${window.start} to ${window.end}. A slice carries the goals and areas its rows point at even when those were made earlier, plus what every counter read on ${window.start}, so it can be read on its own.`
            : "Every day the app has ever recorded."}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button small onClick={download} disabled={busy}>
          {busy ? "Building…" : window ? "Download this period" : "Download everything"}
        </Button>
        {built && !busy && (
          <span className="text-xs text-ink-3">
            {built.files} files · {prettyBytes(built.bytes)}
          </span>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      <p className="mt-3 text-xs leading-relaxed text-ink-3">
        These files are yours to keep, read, or feed to whatever you like. LoopUpward has no
        AI in it and never talks to one: what it does instead is record honestly, so that when
        you do want to ask something of your own life, you have the material to ask with.
        Where the record cannot know something — what a habit asked for before you changed
        it, what a routine&rsquo;s steps were last spring — it says so and leaves the answer
        blank, rather than filling it in with today&rsquo;s.
      </p>
    </Card>
  );
}
