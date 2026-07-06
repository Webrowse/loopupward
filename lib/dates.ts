/** Date helpers. All "day" values are local-timezone ISO dates: YYYY-MM-DD. */

export function toDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function today(): string {
  return toDay(new Date());
}

export function fromDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(day: string, n: number): string {
  const d = fromDay(day);
  d.setDate(d.getDate() + n);
  return toDay(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((fromDay(b).getTime() - fromDay(a).getTime()) / 86400000);
}

/** Monday-start week. */
export function startOfWeek(day: string): string {
  const d = fromDay(day);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return toDay(d);
}

export function startOfMonth(day: string): string {
  return day.slice(0, 8) + "01";
}

export function startOfQuarter(day: string): string {
  const d = fromDay(day);
  const qm = Math.floor(d.getMonth() / 3) * 3;
  return toDay(new Date(d.getFullYear(), qm, 1));
}

export function startOfYear(day: string): string {
  return day.slice(0, 5) + "01-01";
}

export type Period = "week" | "month" | "quarter" | "year";

export function periodRange(period: Period, anchor: string): { start: string; end: string } {
  const d = fromDay(anchor);
  switch (period) {
    case "week": {
      const start = startOfWeek(anchor);
      return { start, end: addDays(start, 6) };
    }
    case "month": {
      const start = startOfMonth(anchor);
      const end = toDay(new Date(d.getFullYear(), d.getMonth() + 1, 0));
      return { start, end };
    }
    case "quarter": {
      const start = startOfQuarter(anchor);
      const sd = fromDay(start);
      const end = toDay(new Date(sd.getFullYear(), sd.getMonth() + 3, 0));
      return { start, end };
    }
    case "year":
      return { start: startOfYear(anchor), end: d.getFullYear() + "-12-31" };
  }
}

/** Anchor day for the previous period of the same length. */
export function previousAnchor(period: Period, anchor: string): string {
  const { start } = periodRange(period, anchor);
  return addDays(start, -1);
}

export function isoWeek(day: string): { year: number; week: number } {
  const d = fromDay(day);
  const t = new Date(d.getTime());
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
  const firstThursday = new Date(t.getFullYear(), 0, 4);
  firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7));
  const week = 1 + Math.round((t.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return { year: t.getFullYear(), week };
}

export function periodKey(period: Period, anchor: string): string {
  const d = fromDay(anchor);
  switch (period) {
    case "week": {
      const { year, week } = isoWeek(anchor);
      return `${year}-W${String(week).padStart(2, "0")}`;
    }
    case "month":
      return anchor.slice(0, 7);
    case "quarter":
      return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
    case "year":
      return String(d.getFullYear());
  }
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function prettyDay(day: string): string {
  const d = fromDay(day);
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function shortDay(day: string): string {
  const d = fromDay(day);
  return `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
}

export function prettyPeriod(period: Period, anchor: string): string {
  const { start, end } = periodRange(period, anchor);
  const d = fromDay(anchor);
  switch (period) {
    case "week":
      return `${shortDay(start)} – ${shortDay(end)}`;
    case "month":
      return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    case "quarter":
      return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
    case "year":
      return String(d.getFullYear());
  }
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Late night thoughts";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
