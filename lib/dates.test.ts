import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_WEEK_START,
} from "@/lib/types";
import {
  getDefaultWeekStart,
  isoWeek,
  periodKey,
  periodRange,
  setDefaultWeekStart,
  startOfWeek,
} from "@/lib/dates";

// the default is module state, so every test puts it back
afterEach(() => setDefaultWeekStart(DEFAULT_WEEK_START));

describe("startOfWeek", () => {
  // 2026-08-18 is a Tuesday
  it("counts back to the most recent start weekday", () => {
    expect(startOfWeek("2026-08-18", 1)).toBe("2026-08-17"); // Monday
    expect(startOfWeek("2026-08-18", 0)).toBe("2026-08-16"); // Sunday
    expect(startOfWeek("2026-08-18", 6)).toBe("2026-08-15"); // Saturday
    expect(startOfWeek("2026-08-18", 2)).toBe("2026-08-18"); // Tuesday, itself
  });

  it("stays on the day itself when the week starts that weekday", () => {
    expect(startOfWeek("2026-08-17", 1)).toBe("2026-08-17");
  });

  it("uses the configured default when no argument is given", () => {
    expect(startOfWeek("2026-08-18")).toBe("2026-08-17");
    setDefaultWeekStart(0);
    expect(getDefaultWeekStart()).toBe(0);
    expect(startOfWeek("2026-08-18")).toBe("2026-08-16");
  });

  it("treats a missing setting as Monday", () => {
    setDefaultWeekStart(null);
    expect(getDefaultWeekStart()).toBe(DEFAULT_WEEK_START);
    expect(startOfWeek("2026-08-18")).toBe("2026-08-17");
  });
});

describe("week numbering", () => {
  it("reproduces ISO-8601 exactly on the Monday default", () => {
    // ISO: 2026-01-01 is a Thursday, so it belongs to week 1 of 2026
    expect(isoWeek("2026-01-01", 1)).toEqual({ year: 2026, week: 1 });
    // and the Monday before it belongs to the same week
    expect(isoWeek("2025-12-29", 1)).toEqual({ year: 2026, week: 1 });
    expect(isoWeek("2026-08-18", 1)).toEqual({ year: 2026, week: 34 });
  });

  it("names a different seven days once the start day moves", () => {
    // 2026-08-16 is a Sunday. Under Monday-start it closes the week that began
    // on the 10th; under Sunday-start it opens the week that runs to the 22nd.
    // (The week NUMBER can coincide, which is exactly why the export records
    // the start day beside the key rather than trusting the key alone.)
    expect(startOfWeek("2026-08-16", 1)).toBe("2026-08-10");
    expect(startOfWeek("2026-08-16", 0)).toBe("2026-08-16");
    setDefaultWeekStart(1);
    const asMonday = periodRange("week", "2026-08-16");
    setDefaultWeekStart(0);
    const asSunday = periodRange("week", "2026-08-16");
    expect(asMonday).not.toEqual(asSunday);
    expect(asSunday).toEqual({ start: "2026-08-16", end: "2026-08-22" });
  });

  it("keeps every day of one week under a single key", () => {
    for (const start of [0, 1, 6]) {
      const first = startOfWeek("2026-08-18", start);
      const keys = new Set(
        Array.from({ length: 7 }, (_, i) => {
          const d = new Date(`${first}T12:00:00`);
          d.setDate(d.getDate() + i);
          return JSON.stringify(isoWeek(d.toISOString().slice(0, 10), start));
        })
      );
      expect(keys.size).toBe(1);
    }
  });
});

describe("weekly period range and key follow the setting", () => {
  it("spans the seven days beginning on the chosen weekday", () => {
    setDefaultWeekStart(0);
    expect(periodRange("week", "2026-08-18")).toEqual({ start: "2026-08-16", end: "2026-08-22" });
    setDefaultWeekStart(1);
    expect(periodRange("week", "2026-08-18")).toEqual({ start: "2026-08-17", end: "2026-08-23" });
  });

  it("keeps the YYYY-Www shape whatever the start day", () => {
    setDefaultWeekStart(0);
    expect(periodKey("week", "2026-08-18")).toMatch(/^\d{4}-W\d{2}$/);
  });

  it("leaves month, quarter and year alone", () => {
    setDefaultWeekStart(0);
    expect(periodKey("month", "2026-08-18")).toBe("2026-08");
    expect(periodKey("quarter", "2026-08-18")).toBe("2026-Q3");
    expect(periodKey("year", "2026-08-18")).toBe("2026");
  });
});
