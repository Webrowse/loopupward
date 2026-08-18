import { describe, expect, it } from "vitest";
import { csvField, csvFile, timeColumns, timeHeaders } from "@/lib/export/csv";
import { crc32, makeZip } from "@/lib/export/zip";
import { buildBundle, BundleInput } from "@/lib/export/bundle";
import { isoWithOffset, localTime, weekdayName } from "@/lib/clock";
import { routineLogDay } from "@/lib/progress";
import {
  AppEvent,
  DB,
  EMPTY_DB,
  EMPTY_SETTINGS,
  EMPTY_STREAMS,
  FocusSession,
  HabitDayNote,
  Item,
  Streams,
} from "@/lib/types";

/* ————— fixtures ————— */

function item(over: Partial<Item> = {}): Item {
  return {
    id: "i1", areaId: null, parentId: null, kind: "routine", tracker: "habit",
    title: "Night routine", note: "", target: null, current: 0, unit: null, horizon: null,
    horizonPeriod: null, dateRepeatsYearly: false, richBody: null, status: "active",
    cadence: "daily", cadenceDays: null, cadenceCount: null, steps: null, entries: null,
    windowStart: null, windowEnd: null, pulledToday: false, labels: [], pinned: false,
    position: 0, createdAt: Date.parse("2026-08-01T09:00:00"), completedAt: null, deletedAt: null,
    ...over,
  };
}

function bundleInput(db: Partial<DB> = {}, streams: Partial<Streams> = {}): BundleInput {
  return {
    db: { ...structuredClone(EMPTY_DB), ...db },
    streams: { ...structuredClone(EMPTY_STREAMS), ...streams },
    settings: { ...EMPTY_SETTINGS, timezone: "Asia/Kolkata", dayRolloverHour: 4 },
    account: { email: null, mode: "local" },
    generatedAt: Date.parse("2026-08-18T10:00:00"),
    today: "2026-08-18",
  };
}

function fileNamed(files: { name: string; content: string }[], name: string): string {
  const f = files.find((x) => x.name === name);
  if (!f) throw new Error(`no ${name} in bundle`);
  return f.content;
}

/** Split one CSV line, honouring RFC 4180 quoting — so the tests parse the
 *  file the way a reader would rather than trusting the writer's own idea. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { out.push(field); field = ""; }
    else field += c;
  }
  out.push(field);
  return out;
}

function rowsOf(csv: string): string[][] {
  // records can contain embedded newlines inside quotes, so join and re-split
  // on record boundaries the same way a parser does
  const records: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (c === '"') quoted = !quoted;
    if (!quoted && c === "\r" && csv[i + 1] === "\n") {
      records.push(cur);
      cur = "";
      i++;
      continue;
    }
    cur += c;
  }
  if (cur) records.push(cur);
  return records.filter((r) => r.length > 0).map(parseCsvLine);
}

/* ————— CSV quoting ————— */

describe("csv quoting (RFC 4180)", () => {
  it("leaves ordinary values alone", () => {
    expect(csvField("hello")).toBe("hello");
    expect(csvField(42)).toBe("42");
    expect(csvField(true)).toBe("true");
  });

  it("writes null and undefined as empty, never as the word", () => {
    // an empty cell means "not recorded", which is not the same as zero and
    // definitely not the same as the string "null"
    expect(csvField(null)).toBe("");
    expect(csvField(undefined)).toBe("");
  });

  it("quotes commas, quotes, and newlines, doubling inner quotes", () => {
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("line1\nline2")).toBe('"line1\nline2"');
    expect(csvField("carriage\rreturn")).toBe('"carriage\rreturn"');
  });

  it("quotes values with edge whitespace, which spreadsheets otherwise eat", () => {
    expect(csvField("  padded ")).toBe('"  padded "');
  });

  it("round-trips a nasty value through a whole file", () => {
    const nasty = 'He said "go, now"\nand left ';
    const csv = csvFile(["a", "b"], [[nasty, 1]]);
    const rows = rowsOf(csv);
    expect(rows[0]).toEqual(["a", "b"]);
    expect(rows[1][0]).toBe(nasty);
    expect(rows[1][1]).toBe("1");
  });

  it("ends records with CRLF, which is what RFC 4180 and Excel expect", () => {
    expect(csvFile(["a"], [["1"]])).toBe("a\r\n1\r\n");
  });
});

/* ————— timezone columns ————— */

describe("timestamp columns", () => {
  it("emits ISO with offset, local time and weekday together", () => {
    const at = Date.parse("2026-08-18T06:12:44");
    const [iso, local, weekday] = timeColumns(at);
    // the ISO column carries the offset that was in force, so the reader
    // never has to consult a settings file to place the moment
    expect(iso).toMatch(/^2026-08-18T06:12:44[+-]\d{2}:\d{2}$/);
    expect(iso).toBe(isoWithOffset(at));
    expect(local).toBe(localTime(at));
    expect(local).toBe("06:12");
    expect(weekday).toBe(weekdayName(at));
  });

  it("leaves all three blank when there is no timestamp", () => {
    expect(timeColumns(null)).toEqual(["", "", ""]);
  });

  it("names the three columns consistently", () => {
    expect(timeHeaders("done")).toEqual(["done_at", "done_local_time", "done_weekday"]);
  });

  it("puts every focus session's local time and weekday in the file", () => {
    const startedAt = Date.parse("2026-08-18T22:40:00");
    const session: FocusSession = {
      id: "s1", itemId: null, entryId: "e1", day: "2026-08-18", kind: "focus", stepId: null,
      startedAt, endedAt: startedAt + 25 * 60_000, plannedSeconds: 1500, actualSeconds: 1500,
      pausedSeconds: 0, pauseCount: 0, outcome: "completed",
      tz: "Asia/Kolkata", utcOffsetMinutes: 330, createdAt: startedAt,
    };
    const rows = rowsOf(fileNamed(buildBundle(bundleInput({}, { focusSessions: [session] })), "focus_sessions.csv"));
    const header = rows[0];
    const row = rows[1];
    expect(row[header.indexOf("started_local_time")]).toBe("22:40");
    expect(row[header.indexOf("started_weekday")]).toBe("Tuesday");
    expect(row[header.indexOf("planned_minutes")]).toBe("25");
    expect(row[header.indexOf("actual_minutes")]).toBe("25");
    expect(row[header.indexOf("over_under_ratio")]).toBe("1");
  });
});

/* ————— the day-attribution rule the whole export depends on ————— */

describe("routine day attribution in the export", () => {
  const nightRoutine = item({
    id: "r1", title: "Night routine", windowStart: "21:00", windowEnd: "02:00",
    steps: [
      { id: "s1", title: "Tidy", minutes: 5 },
      { id: "s2", title: "Read", minutes: 20 },
    ],
  });

  it("gives a 1am tick to the evening before, not to the calendar day", () => {
    // this is the rule README.md documents; if it ever changes, the export's
    // own description of itself becomes wrong, so it is pinned here
    const at1am = new Date("2026-08-09T01:15:00");
    expect(routineLogDay(nightRoutine, at1am)).toBe("2026-08-08");

    const at10pm = new Date("2026-08-08T22:00:00");
    expect(routineLogDay(nightRoutine, at10pm)).toBe("2026-08-08");
  });

  it("writes routine_steps rows under that day, with tick times and order", () => {
    const tidyAt = Date.parse("2026-08-08T21:10:00");
    // read happened after midnight — same night, next calendar day
    const readAt = Date.parse("2026-08-09T01:15:00");
    const note: HabitDayNote = {
      id: "n1", itemId: "r1", date: "2026-08-08", text: "wind down",
      doneSteps: ["s1", "s2"],
      doneStepsAt: { s1: tidyAt, s2: readAt },
      createdAt: tidyAt, updatedAt: readAt,
    };
    const rows = rowsOf(
      fileNamed(buildBundle(bundleInput({ items: [nightRoutine], habitDayNotes: [note] })), "routine_steps.csv")
    );
    const header = rows[0];
    const byStep = new Map(rows.slice(1).map((r) => [r[header.indexOf("step_id")], r]));

    // both steps belong to the 8th, including the one ticked on the 9th
    expect(byStep.get("s1")![header.indexOf("day")]).toBe("2026-08-08");
    expect(byStep.get("s2")![header.indexOf("day")]).toBe("2026-08-08");
    // ...while the timestamps still tell the truth about the clock
    expect(byStep.get("s2")![header.indexOf("done_local_time")]).toBe("01:15");
    expect(byStep.get("s2")![header.indexOf("done_at")]).toContain("2026-08-09T01:15");
    // and the order they were really walked in is recorded
    expect(byStep.get("s1")![header.indexOf("tick_order")]).toBe("1");
    expect(byStep.get("s2")![header.indexOf("tick_order")]).toBe("2");
  });

  it("leaves done_at blank for ticks recorded before step timestamps existed", () => {
    const note: HabitDayNote = {
      id: "n2", itemId: "r1", date: "2026-08-07", text: "",
      doneSteps: ["s1"], doneStepsAt: null,
      createdAt: 0, updatedAt: 0,
    };
    const rows = rowsOf(
      fileNamed(buildBundle(bundleInput({ items: [nightRoutine], habitDayNotes: [note] })), "routine_steps.csv")
    );
    const header = rows[0];
    const s1 = rows.slice(1).find((r) => r[header.indexOf("step_id")] === "s1")!;
    expect(s1[header.indexOf("done")]).toBe("true");
    // blank, not invented: the tick happened, the time was never recorded
    expect(s1[header.indexOf("done_at")]).toBe("");
    expect(s1[header.indexOf("tick_order")]).toBe("");
  });
});

/* ————— the bundle as a whole ————— */

describe("bundle contents", () => {
  it("contains every promised file, with a header row on each CSV", () => {
    const files = buildBundle(bundleInput());
    const names = files.map((f) => f.name);
    for (const expected of [
      "README.md", "context.md", "summary.md",
      "areas.csv", "items.csv", "actions.csv", "logs.csv", "focus_sessions.csv",
      "habit_days.csv", "routine_steps.csv", "list_entries.csv", "seeds.csv", "labels.csv",
      "day_order.csv", "daily.csv", "events.ndjson",
      "journal.md", "reflections.md", "notes.md", "raw.json",
    ]) {
      expect(names).toContain(expected);
    }
    for (const f of files.filter((x) => x.name.endsWith(".csv"))) {
      expect(f.content.split("\r\n")[0].length).toBeGreaterThan(0);
    }
  });

  it("denormalizes item title and area name onto log rows", () => {
    const files = buildBundle(
      bundleInput({
        areas: [{ id: "a1", name: "Health", emoji: "🌿", color: "moss", position: 0, createdAt: 0 }],
        items: [item({ id: "i1", areaId: "a1", kind: "habit", title: "Pushups" })],
        logs: [{ id: "l1", itemId: "i1", date: "2026-08-18", op: "add", value: 1, createdAt: Date.parse("2026-08-18T07:30:00"), source: "routine_run", via: "last_required_step" }],
      })
    );
    const rows = rowsOf(fileNamed(files, "logs.csv"));
    const header = rows[0];
    const row = rows[1];
    // readable standalone: no join needed to know what moved or where it lives
    expect(row[header.indexOf("item_title")]).toBe("Pushups");
    expect(row[header.indexOf("area_name")]).toBe("Health");
    expect(row[header.indexOf("source")]).toBe("routine_run");
    expect(row[header.indexOf("via")]).toBe("last_required_step");
  });

  it("defaults a log with no recorded provenance to unknown, not manual", () => {
    const files = buildBundle(
      bundleInput({
        items: [item({ id: "i1", kind: "habit", title: "Old habit" })],
        logs: [{ id: "l1", itemId: "i1", date: "2026-08-01", op: "add", value: 1, createdAt: 0 }],
      })
    );
    const rows = rowsOf(fileNamed(files, "logs.csv"));
    expect(rows[1][rows[0].indexOf("source")]).toBe("unknown");
  });

  it("writes events.ndjson as one JSON object per line, oldest first", () => {
    const files = buildBundle(
      bundleInput({}, {
        events: [
          { id: "e2", at: Date.parse("2026-08-18T09:00:00"), day: "2026-08-18", tz: "Asia/Kolkata", utcOffsetMinutes: 330, type: "app.opened", itemId: null, payload: {}, createdAt: 0 },
          { id: "e1", at: Date.parse("2026-08-17T09:00:00"), day: "2026-08-17", tz: "Asia/Kolkata", utcOffsetMinutes: 330, type: "action.rescheduled", itemId: null, payload: { from: "2026-08-17", to: "2026-08-18", daysMoved: 1 }, createdAt: 0 },
        ],
      })
    );
    const lines = fileNamed(files, "events.ndjson").trim().split("\n");
    const parsed = lines.map((l) => JSON.parse(l));
    expect(parsed.map((p) => p.id)).toEqual(["e1", "e2"]);
    expect(parsed[0].payload.daysMoved).toBe(1);
    expect(parsed[0].local_time).toBe("09:00");
    expect(parsed[0].weekday).toBe("Monday");
  });

  it("keeps the day-attribution rule in the README, since the files rely on it", () => {
    const readme = fileNamed(buildBundle(bundleInput()), "README.md");
    expect(readme).toContain("rollover hour");
    expect(readme).toContain("wraps past midnight");
    expect(readme).toContain("21:00 → 02:00");
  });
});

/* ————— nothing may reach raw.json and stop there ————— */

describe("everything the app stores reaches a readable file", () => {
  it("puts a habit's day plan somewhere a person would find it", () => {
    // this exact text used to survive only in raw.json: routine_steps.csv
    // skips anything without a script, which is most habits
    const habit = item({ id: "h1", kind: "habit", tracker: "habit", title: "Clean", steps: null });
    const files = buildBundle(
      bundleInput({
        items: [habit],
        habitDayNotes: [
          {
            id: "n1", itemId: "h1", date: "2026-08-17", text: "clean the side desk",
            doneSteps: null, doneStepsAt: null, createdAt: 0, updatedAt: 0,
          },
        ],
      })
    );
    const readable = files
      .filter((f) => f.name !== "raw.json" && f.content.includes("clean the side desk"))
      .map((f) => f.name);
    expect(readable).toContain("habit_days.csv");
  });

  const waterHabit = item({ id: "h1", kind: "habit", tracker: "habit", title: "Water", target: 3 });
  const twoGlasses = [
    { id: "l1", itemId: "h1", date: "2026-08-17", op: "add" as const, value: 1, createdAt: 0 },
    { id: "l2", itemId: "h1", date: "2026-08-17", op: "add" as const, value: 1, createdAt: 0 },
  ];
  const waterDayNote: HabitDayNote = {
    id: "n1", itemId: "h1", date: "2026-08-17", text: "", doneSteps: null, doneStepsAt: null,
    createdAt: 0, updatedAt: 0,
  };
  /** An item.created event means the item was born inside the observed window,
   *  so everything it has ever been is reconstructable. */
  const bornEvent = (itemId: string, at: string, payload: Record<string, unknown> = {}): AppEvent => ({
    id: `born-${itemId}`, at: Date.parse(at), day: at.slice(0, 10), tz: "Asia/Kolkata",
    utcOffsetMinutes: 330, type: "item.created", itemId, payload, createdAt: Date.parse(at),
  });

  it("says whether the day counted, against the target of THAT day", () => {
    const rows = rowsOf(
      fileNamed(
        buildBundle(
          bundleInput(
            { items: [waterHabit], logs: twoGlasses, habitDayNotes: [waterDayNote] },
            { events: [bornEvent("h1", "2026-08-01T09:00:00")] }
          )
        ),
        "habit_days.csv"
      )
    );
    const header = rows[0];
    const row = rows[1];
    // two of three glasses: real progress, and not a day that counted
    expect(row[header.indexOf("value_logged")]).toBe("2");
    expect(row[header.indexOf("daily_target")]).toBe("3");
    expect(row[header.indexOf("logged")]).toBe("false");
    expect(row[header.indexOf("target_source")]).toBe("recorded");
  });

  it("uses the target as it was on the day, not the one it has now", () => {
    // the habit reads 3 today, but it was raised from 2 on the 18th — so the
    // 17th, when two glasses were logged, was a day that COUNTED
    const raised: AppEvent = {
      id: "ev-raise", at: Date.parse("2026-08-18T09:00:00"), day: "2026-08-18",
      tz: "Asia/Kolkata", utcOffsetMinutes: 330, type: "item.target_changed", itemId: "h1",
      payload: { from: 2, to: 3 }, createdAt: 0,
    };
    const rows = rowsOf(
      fileNamed(
        buildBundle(
          bundleInput(
            { items: [waterHabit], logs: twoGlasses, habitDayNotes: [waterDayNote] },
            { events: [bornEvent("h1", "2026-08-01T09:00:00"), raised] }
          )
        ),
        "habit_days.csv"
      )
    );
    const header = rows[0];
    const row = rows[1];
    expect(row[header.indexOf("daily_target")]).toBe("2");
    expect(row[header.indexOf("logged")]).toBe("true");
    // raising your sights must not turn kept promises into broken ones
    expect(row[header.indexOf("daily_target_current")]).toBe("3");
  });

  it("refuses a verdict when the target of the day was never recorded", () => {
    // no events at all: the day predates anything being observed, so what the
    // day asked for is genuinely unknown — and a blank beats a wrong answer
    const rows = rowsOf(
      fileNamed(
        buildBundle(bundleInput({ items: [waterHabit], logs: twoGlasses, habitDayNotes: [waterDayNote] })),
        "habit_days.csv"
      )
    );
    const header = rows[0];
    const row = rows[1];
    expect(row[header.indexOf("value_logged")]).toBe("2");
    expect(row[header.indexOf("logged")]).toBe("");
    expect(row[header.indexOf("daily_target")]).toBe("");
    expect(row[header.indexOf("target_source")]).toBe("unknown");
    // what it asks for today is still there, honestly labelled as today's
    expect(row[header.indexOf("daily_target_current")]).toBe("3");
  });
});

/**
 * The guard for the whole class of bug this file exists to prevent: a field
 * gets added to the app, and quietly reaches no readable file. raw.json holds
 * everything by construction, so it does not count as coverage — the question
 * is whether a person opening the folder would ever find the value.
 *
 * Every stored text field below carries a unique marker; if a new one is added
 * to the model and nowhere to the bundle, this fails and names it.
 */
describe("coverage: nothing reaches raw.json and stops there", () => {
  const M = (k: string) => `ZZMARK${k}ZZ`;

  it("puts every stored field in at least one readable file", () => {
    const db: Partial<DB> = {
      areas: [{ id: "a1", name: M("areaName"), emoji: "🌿", color: "moss", position: 0, createdAt: 1, description: M("areaDesc"), whyItMatters: M("areaWhy"), targetShare: 0.25 }],
      items: [
        item({ id: "i1", areaId: "a1", kind: "note", tracker: "none", title: M("noteTitle"), note: M("itemNote"), richBody: M("richBody"), labels: ["lb1"], cadence: null }),
        item({ id: "i2", areaId: "a1", kind: "list", tracker: "none", title: M("listTitle"), cadence: null,
          entries: [{ id: "e1", text: M("entryText"), amount: 2, unit: M("entryUnit"), done: false, pickedAt: 1 }] }),
        item({ id: "i3", areaId: "a1", kind: "habit", tracker: "habit", title: M("habitTitle") }),
      ],
      seeds: [{ id: "s1", text: M("seedText"), createdAt: 1, itemId: null, archivedAt: null, status: "inbox" }],
      actions: [{ id: "ac1", itemId: "i1", title: M("actionTitle"), date: "2026-08-17", done: false, doneAt: null, amount: 1, priority: 0, note: M("actionNote"), createdAt: 1 }],
      logs: [{ id: "l1", itemId: "i3", date: "2026-08-17", op: "add", value: 1, createdAt: 1, source: "manual", via: M("logVia") }],
      reflections: [{ id: "rf1", period: "week", periodKey: "2026-W33", text: M("reflText"), createdAt: 1, updatedAt: 1,
        ratings: { overall: 4, energy: 3, progress: 5 }, wins: [M("win")], lessons: [M("lesson")], blockers: [M("blocker")],
        intentions: [{ id: "in1", text: M("intention"), itemId: "i3", targetValue: 3 }],
        areaNotes: { a1: { rating: 4, note: M("areaNote") } } }],
      journal: [{ id: "j1", date: "2026-08-17", roughNotes: M("rough"), endOfDay: M("eod"), mood: 4, energy: 3,
        sleepHours: 7, sleepQuality: 4, stress: 2, focus: 5, gratitude: M("gratitude"), intention: M("dayIntention"),
        tags: [M("dayTag")], createdAt: 1, updatedAt: 1 }],
      labels: [{ id: "lb1", name: M("labelName"), color: "moss", emoji: "🏷️", position: 0, createdAt: 1 }],
      habitDayNotes: [{ id: "n1", itemId: "i3", date: "2026-08-17", text: M("dayPlan"), doneSteps: null, doneStepsAt: null, createdAt: 1, updatedAt: 1 }],
      dayOrder: [{ id: "d1", date: "2026-08-17", order: [M("orderEntry")], updatedAt: 1 }],
    };
    const streams: Partial<Streams> = {
      focusSessions: [{ id: "fs1", itemId: "i3", entryId: M("entryId"), day: "2026-08-17", kind: "focus", stepId: null,
        startedAt: 1, endedAt: 2, plannedSeconds: 60, actualSeconds: 30, pausedSeconds: 0, pauseCount: 0,
        outcome: "abandoned", tz: M("tz"), utcOffsetMinutes: 330, createdAt: 1 }],
      events: [{ id: "ev1", at: 1, day: "2026-08-17", tz: "T", utcOffsetMinutes: 330, type: "item.created",
        itemId: "i1", payload: { note: M("eventPayload") }, createdAt: 1 }],
    };
    // No self-description here any more: the settings form that asked "what are
    // you trying to become" is gone, and so are the fields it fed. What the
    // person said mattered to them lives in the journal, the reflections and
    // the areas, which this fixture covers through their own markers.
    const settings = { ...EMPTY_SETTINGS, timezone: M("settingsTz"), dayRolloverHour: 4 };

    const files = buildBundle({ ...bundleInput(db, streams), settings });
    const readable = files.filter((f) => f.name !== "raw.json");
    const markers = [
      ...new Set([...JSON.stringify({ db, streams, settings }).matchAll(/ZZMARK(\w+?)ZZ/g)].map((m) => m[1])),
    ];
    expect(markers.length).toBeGreaterThan(20);

    const orphaned = markers.filter((k) => !readable.some((f) => f.content.includes(M(k))));
    expect(orphaned).toEqual([]);
  });
});

/* ————— the zip ————— */

describe("zip writer", () => {
  it("computes the CRC-32 the format specifies", () => {
    // the standard check value for "123456789"
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("writes local headers, a central directory and an EOCD", () => {
    const zip = makeZip([{ name: "a.txt", content: "hello" }], new Date("2026-08-18T10:00:00"));
    const view = new DataView(zip.buffer as ArrayBuffer, zip.byteOffset, zip.byteLength);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    // the end-of-central-directory record closes the file
    expect(view.getUint32(zip.length - 22, true)).toBe(0x06054b50);
    expect(view.getUint16(zip.length - 22 + 10, true)).toBe(1); // one entry
  });

  it("stores content verbatim, so an unzipper reads exactly what was written", () => {
    const content = "day,weekday\r\n2026-08-18,Tuesday\r\n";
    const zip = makeZip([{ name: "daily.csv", content }]);
    const text = new TextDecoder().decode(zip);
    expect(text).toContain("daily.csv");
    expect(text).toContain(content);
  });
});

/* ————— never manufacture a historical fact ————— */

describe("historical state is reconstructed, never borrowed from today", () => {
  const at = (iso: string) => Date.parse(iso);
  const ev = (over: Partial<AppEvent> & Pick<AppEvent, "type">): AppEvent => ({
    id: `e-${Math.random()}`, at: at("2026-08-10T09:00:00"), day: "2026-08-10",
    tz: "Asia/Kolkata", utcOffsetMinutes: 330, itemId: null, payload: {}, createdAt: 0,
    ...over,
  });

  const routine = item({
    id: "r1", kind: "routine", tracker: "habit", title: "Morning",
    steps: [
      { id: "s1", title: "Wash", minutes: 5 },
      { id: "s2", title: "Meditate", minutes: 15 },
      { id: "s3", title: "Journal", minutes: 10 },
    ],
  });
  // on the 5th only the first two steps existed; "Journal" was added on the 9th
  const dayNote: HabitDayNote = {
    id: "n1", itemId: "r1", date: "2026-08-05", text: "",
    doneSteps: ["s1", "s2"], doneStepsAt: { s1: at("2026-08-05T06:00:00"), s2: at("2026-08-05T06:10:00") },
    createdAt: 0, updatedAt: 0,
  };
  const stepsAdded = ev({
    type: "item.steps_changed", itemId: "r1", at: at("2026-08-09T08:00:00"), day: "2026-08-09",
    payload: { fromIds: ["s1", "s2"], toIds: ["s1", "s2", "s3"], added: [{ id: "s3" }], removed: [] },
  });

  it("omits a routine step from days before it was written into the script", () => {
    const rows = rowsOf(
      fileNamed(
        buildBundle(
          bundleInput(
            { items: [routine], habitDayNotes: [dayNote] },
            { events: [ev({ type: "item.created", itemId: "r1", at: at("2026-08-01T09:00:00"), day: "2026-08-01" }), stepsAdded] }
          )
        ),
        "routine_steps.csv"
      )
    );
    const header = rows[0];
    const onThe5th = rows.slice(1).filter((r) => r[header.indexOf("day")] === "2026-08-05");
    // a step added on the 9th is not a step failed on the 5th
    expect(onThe5th.map((r) => r[header.indexOf("step_id")]).sort()).toEqual(["s1", "s2"]);
    expect(onThe5th[0][header.indexOf("script_source")]).toBe("recorded");
  });

  it("leaves `done` blank, not false, when the script of the day is unknown", () => {
    // no events: the script that morning is genuinely unrecoverable
    const rows = rowsOf(
      fileNamed(buildBundle(bundleInput({ items: [routine], habitDayNotes: [dayNote] })), "routine_steps.csv")
    );
    const header = rows[0];
    const byStep = new Map(rows.slice(1).map((r) => [r[header.indexOf("step_id")], r]));
    expect(byStep.get("s1")![header.indexOf("done")]).toBe("true");
    // s3 was not ticked — but we cannot say it was skipped, only that we cannot say
    expect(byStep.get("s3")![header.indexOf("done")]).toBe("");
    expect(byStep.get("s3")![header.indexOf("script_source")]).toBe("unknown");
  });
});

/* ————— what was supposed to happen ————— */

describe("schedule_expectations.csv", () => {
  const at = (iso: string) => Date.parse(iso);
  const born = (itemId: string, iso: string): AppEvent => ({
    id: `b-${itemId}`, at: at(iso), day: iso.slice(0, 10), tz: "Asia/Kolkata", utcOffsetMinutes: 330,
    type: "item.created", itemId, payload: {}, createdAt: 0,
  });

  const gym = item({
    id: "g1", kind: "habit", tracker: "habit", title: "Gym", cadence: "days",
    cadenceDays: [1, 3], createdAt: at("2026-08-10T09:00:00"),
  });

  function expectationRows(db: Partial<DB>, events: AppEvent[]) {
    const rows = rowsOf(
      fileNamed(buildBundle(bundleInput(db, { events })), "schedule_expectations.csv")
    );
    const header = rows[0];
    return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
  }

  it("marks the days a fixed schedule named, and the days it did not", () => {
    const rows = expectationRows(
      { items: [gym], logs: [{ id: "l1", itemId: "g1", date: "2026-08-10", op: "add", value: 1, createdAt: 0 }] },
      [born("g1", "2026-08-10T09:00:00")]
    );
    const mon = rows.find((r) => r.day === "2026-08-10")!; // Monday
    const tue = rows.find((r) => r.day === "2026-08-11")!; // Tuesday
    expect(mon.expectation).toBe("required");
    expect(mon.met).toBe("true");
    expect(tue.expectation).toBe("not_due");
    // the missed Wednesday is a row, which is the whole point: a missed day
    // used to be the absence of one, and absences cannot be counted
    const wed = rows.find((r) => r.day === "2026-08-12")!;
    expect(wed.expectation).toBe("required");
    expect(wed.met).toBe("false");
  });

  it("treats a quota schedule as eligible days against a period, not owed days", () => {
    const swim = item({
      id: "w1", kind: "habit", tracker: "habit", title: "Swim", cadence: "weekly",
      cadenceCount: 3, createdAt: at("2026-08-10T09:00:00"),
    });
    const rows = expectationRows({ items: [swim] }, [born("w1", "2026-08-10T09:00:00")]);
    const row = rows.find((r) => r.day === "2026-08-11")!;
    expect(row.expectation).toBe("eligible");
    expect(row.quota_target).toBe("3");
    expect(row.quota_period).toBe("2026-W33");
  });

  it("says unknown rather than assuming today's schedule ran back then", () => {
    // no events at all: the cadence of those days was never recorded
    const rows = expectationRows({ items: [gym] }, []);
    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(rows.map((r) => r.expectation))).toEqual(new Set(["unknown"]));
    expect(rows[0].cadence_source).toBe("unknown");
    expect(rows[0].met).toBe("");
  });

  it("stops expecting a habit once it is retired", () => {
    const retired = item({
      ...gym, id: "g2", status: "done", completedAt: at("2026-08-12T09:00:00"),
    });
    const rows = expectationRows({ items: [retired] }, [born("g2", "2026-08-10T09:00:00")]);
    // the months after you deliberately stopped are not months of failure
    expect(rows.every((r) => r.day <= "2026-08-12")).toBe(true);
  });
});

/* ————— postponement, provenance, and the record's own limits ————— */

describe("evidence that used to be invisible", () => {
  it("counts how long an unfinished task has been carried", () => {
    const rows = rowsOf(
      fileNamed(
        buildBundle(
          bundleInput({
            actions: [
              { id: "a1", itemId: null, title: "Call the dentist", date: "2026-08-01", done: false,
                doneAt: null, amount: 1, priority: 0, note: "", createdAt: 0 },
            ],
          })
        ),
        "actions.csv"
      )
    );
    const header = rows[0];
    // the app carries this forward silently, with no event and no date change —
    // so this column is the only place the dragging shows at all
    expect(rows[1][header.indexOf("carried_days")]).toBe("17");
    expect(rows[1][header.indexOf("done")]).toBe("false");
  });

  it("counts the period instances an unfinished goal has rolled through", () => {
    const goal = item({
      id: "q1", kind: "goal", tracker: "check", title: "Ship the thing",
      horizon: "month", horizonPeriod: "2026-05-04", cadence: null, status: "active",
    });
    const rows = rowsOf(fileNamed(buildBundle(bundleInput({ items: [goal] })), "items.csv"));
    const header = rows[0];
    // filed under May, still open in August
    expect(rows[1][header.indexOf("carried_periods")]).toBe("3");
  });

  it("records where a task came from, and blanks it rather than claiming manual", () => {
    const created: AppEvent = {
      id: "e1", at: Date.parse("2026-08-17T09:00:00"), day: "2026-08-17", tz: "Asia/Kolkata",
      utcOffsetMinutes: 330, type: "action.created", itemId: null,
      payload: { actionId: "a1", origin: "goal_piece" }, createdAt: 0,
    };
    const actions = [
      { id: "a1", itemId: null, title: "Read chapter 1", date: "2026-08-17", done: false, doneAt: null, amount: 1, priority: 0, note: "", createdAt: 0 },
      { id: "a2", itemId: null, title: "Older task", date: "2026-08-17", done: false, doneAt: null, amount: 1, priority: 0, note: "", createdAt: 0 },
    ];
    const rows = rowsOf(fileNamed(buildBundle(bundleInput({ actions }, { events: [created] })), "actions.csv"));
    const header = rows[0];
    const byId = new Map(rows.slice(1).map((r) => [r[header.indexOf("action_id")], r]));
    expect(byId.get("a1")![header.indexOf("origin")]).toBe("goal_piece");
    // unrecorded provenance is blank, not "manual" — the old field claimed
    // three values and only ever held one
    expect(byId.get("a2")![header.indexOf("origin")]).toBe("");
  });

  it("says where the observed record begins, so zeros are not read as dormancy", () => {
    const events: AppEvent[] = [
      { id: "e1", at: Date.parse("2026-08-15T09:00:00"), day: "2026-08-15", tz: "Asia/Kolkata",
        utcOffsetMinutes: 330, type: "app.opened", itemId: null, payload: {}, createdAt: 0 },
    ];
    const files = buildBundle(
      bundleInput({ logs: [{ id: "l1", itemId: "i1", date: "2026-01-02", op: "add", value: 1, createdAt: 0 }] }, { events })
    );
    const manifest = JSON.parse(fileNamed(files, "manifest.json"));
    expect(manifest.observation_begins).toBe("2026-08-15");
    expect(manifest.coverage["logs.csv"].first).toBe("2026-01-02");
    expect(manifest.coverage["events.ndjson"].first).toBe("2026-08-15");
    // and the README has to say it too, since that is what a person reads
    expect(fileNamed(files, "README.md")).toContain("Nothing was observed before 2026-08-15");
  });

  it("distinguishes a day written up on the day from one reconstructed later", () => {
    const rows = rowsOf(
      fileNamed(
        buildBundle(
          bundleInput({
            journal: [
              { id: "j1", date: "2026-08-05", roughNotes: "on the day", endOfDay: "", mood: null,
                energy: null, createdAt: Date.parse("2026-08-05T21:00:00"), updatedAt: Date.parse("2026-08-05T21:00:00") },
              { id: "j2", date: "2026-08-06", roughNotes: "written much later", endOfDay: "", mood: null,
                energy: null, createdAt: Date.parse("2026-08-17T11:00:00"), updatedAt: Date.parse("2026-08-17T11:00:00") },
            ],
          })
        ),
        "journal.csv"
      )
    );
    const header = rows[0];
    const byId = new Map(rows.slice(1).map((r) => [r[header.indexOf("entry_id")], r]));
    expect(byId.get("j1")![header.indexOf("written_same_day")]).toBe("true");
    expect(byId.get("j2")![header.indexOf("written_same_day")]).toBe("false");
  });

  it("keeps a trashed note's words where a person will read them", () => {
    const trashed = item({
      id: "n9", kind: "note", tracker: "none", cadence: null, title: "Half-formed idea",
      richBody: "ZZTRASHEDBODYZZ", deletedAt: Date.parse("2026-08-16T10:00:00"),
    });
    const files = buildBundle(bundleInput({ items: [trashed] }));
    expect(fileNamed(files, "notes.md")).toContain("ZZTRASHEDBODYZZ");
    expect(fileNamed(files, "notes.md")).toContain("in trash since 2026-08-16");
  });
});

/* ————— timestamps in the zone the moment actually happened in ————— */

describe("timezone fidelity", () => {
  it("renders a stream row from the offset it recorded, not the export's zone", () => {
    // recorded in New York at 08:30 local; the export is being taken in IST
    const startedAt = Date.parse("2026-08-18T12:30:00Z");
    const session: FocusSession = {
      id: "s1", itemId: null, entryId: "e1", day: "2026-08-18", kind: "focus", stepId: null,
      startedAt, endedAt: startedAt + 1_500_000, plannedSeconds: 1500, actualSeconds: 1500,
      pausedSeconds: 0, pauseCount: 0, outcome: "completed",
      tz: "America/New_York", utcOffsetMinutes: -240, createdAt: startedAt,
    };
    const rows = rowsOf(
      fileNamed(buildBundle(bundleInput({}, { focusSessions: [session] })), "focus_sessions.csv")
    );
    const header = rows[0];
    expect(rows[1][header.indexOf("started_local_time")]).toBe("08:30");
    expect(rows[1][header.indexOf("started_at")]).toBe("2026-08-18T08:30:00-04:00");
  });

  it("reads a row with no recorded zone in the user's own timezone", () => {
    const rows = rowsOf(
      fileNamed(
        buildBundle(
          bundleInput({
            seeds: [{ id: "s1", text: "a thought", createdAt: Date.parse("2026-08-18T01:00:00Z"),
              itemId: null, archivedAt: null, status: "inbox" }],
          })
        ),
        "seeds.csv"
      )
    );
    const header = rows[0];
    // settings.timezone is Asia/Kolkata: 01:00 UTC is 06:30 there
    expect(rows[1][header.indexOf("captured_local_time")]).toBe("06:30");
    expect(rows[1][header.indexOf("captured_at")]).toBe("2026-08-18T06:30:00+05:30");
  });

  it("says which grade of answer each file got", () => {
    const manifest = JSON.parse(fileNamed(buildBundle(bundleInput()), "manifest.json"));
    expect(manifest.timezone.source).toBe("profile");
    expect(manifest.timezone.rendered_in).toBe("Asia/Kolkata");
    expect(manifest.timezone.exact_files).toContain("focus_sessions.csv");
    expect(manifest.timezone.assumed_files).toContain("logs.csv");
  });
});

describe("expectations never run ahead of the export", () => {
  it("stops at the day the export was taken", () => {
    // stats' overall span can reach past `today`; a day that has not happened
    // yet cannot have been missed, and must not be counted as a failure
    const habit = item({
      id: "d1", kind: "habit", tracker: "habit", title: "Stretch", cadence: "daily",
      createdAt: Date.parse("2026-08-15T09:00:00"),
    });
    const rows = rowsOf(
      fileNamed(
        buildBundle(
          bundleInput(
            { items: [habit] },
            {
              events: [{
                id: "b", at: Date.parse("2026-08-15T09:00:00"), day: "2026-08-15",
                tz: "Asia/Kolkata", utcOffsetMinutes: 330, type: "item.created",
                itemId: "d1", payload: {}, createdAt: 0,
              }],
            }
          )
        ),
        "schedule_expectations.csv"
      )
    );
    const header = rows[0];
    const days = rows.slice(1).map((r) => r[header.indexOf("day")]);
    expect(days.at(-1)).toBe("2026-08-18"); // bundleInput's today
    expect(days.some((d) => d > "2026-08-18")).toBe(false);
  });
});
