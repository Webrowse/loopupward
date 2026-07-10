import { DB, JournalEntry } from "./types";

/** Journal entries inside [start, end], chronological, skipping days where
 *  nothing was actually written — an empty mood/energy-only day doesn't
 *  count as an entry worth reading back. */
export function journalEntriesInRange(db: DB, start: string, end: string): JournalEntry[] {
  return db.journal
    .filter((j) => j.date >= start && j.date <= end)
    .filter((j) => j.roughNotes.trim() || j.endOfDay.trim())
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** CSV export — plain data, not the reading experience (that's the PDF/print
 *  path); Excel/Sheets expect CRLF row endings. */
export function journalToCsv(entries: JournalEntry[]): string {
  const header = ["date", "mood", "energy", "roughNotes", "endOfDay"];
  const rows = entries.map((e) =>
    [
      e.date,
      e.mood != null ? String(e.mood) : "",
      e.energy != null ? String(e.energy) : "",
      e.roughNotes,
      e.endOfDay,
    ]
      .map(csvField)
      .join(",")
  );
  return [header.join(","), ...rows].join("\r\n");
}

export function downloadTextFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
