"use client";

import { api } from "../api";
import { SERVER_CAPS } from "../limits";
import { DB, EMPTY_DB, EMPTY_STREAMS, Seed, Streams, TableName } from "../types";
import { uid } from "../uid";
import { Repo } from "./repo";

/**
 * Repo backed by the LoopUpward Rust API. Rows travel in the exact client JSON
 * shape; the backend owns validation, ownership checks, and plan limits.
 */
export class CloudRepo implements Repo {
  async load(): Promise<DB> {
    const data = await api<Partial<DB>>("/v1/data");
    return { ...structuredClone(EMPTY_DB), ...data };
  }

  async upsert<T extends TableName>(table: T, rows: DB[T][number][]): Promise<void> {
    await api(`/v1/data/${table}`, { method: "PUT", body: { rows } });
  }

  async remove(table: TableName, ids: string[]): Promise<void> {
    await api(`/v1/data/${table}`, { method: "DELETE", body: { ids } });
  }

  /** Push an entire on-device life into the cloud (first sign-in migration):
   *  the tables, and the two append-only capture streams that describe how
   *  they were actually used. */
  async importAll(db: DB, streams: Streams = EMPTY_STREAMS): Promise<void> {
    await api("/v1/import", {
      method: "POST",
      body: { ...fitToServerCaps(db), ...streams },
    });
  }
}

/** Break one over-long text into word-boundary chunks under `max`. */
function chunk(text: string, max: number): string[] {
  const out: string[] = [];
  let rest = text;
  while (rest.length > max) {
    const slice = rest.slice(0, max);
    const cutAt = slice.lastIndexOf(" ") > max * 0.5 ? slice.lastIndexOf(" ") : max;
    out.push(rest.slice(0, cutAt).trimEnd());
    rest = rest.slice(cutAt).trimStart();
  }
  if (rest) out.push(rest);
  return out;
}

const clamp = (s: string, max: number) => (s.length > max ? s.slice(0, max) : s);
const clampOrNull = (s: string | null, max: number) => (s == null ? s : clamp(s, max));
/** A reflection's bullet lists: bounded in both directions, since the server
 *  rejects the whole import over one stray line. */
const clampLines = (lines: string[] | undefined) =>
  lines?.slice(0, SERVER_CAPS.reflectionLines).map((l) => clamp(l, SERVER_CAPS.reflectionLine));

/**
 * The import endpoint is all-or-nothing: one row over a server cap used to
 * reject the entire migration, and the boot code read that as "cloud is
 * broken" — the user stayed signed out with no idea why. Device mode has no
 * caps, so make the data fit BEFORE sending. A seed is someone's captured
 * thought — never truncated, split into consecutive seeds instead. The
 * other free-text fields clamp to their caps; hitting those locally is
 * near-impossible in practice.
 */
export function fitToServerCaps(db: DB): DB {
  const seeds: Seed[] = [];
  for (const s of db.seeds) {
    if (s.text.length <= SERVER_CAPS.seedText) {
      seeds.push(s);
      continue;
    }
    chunk(s.text, SERVER_CAPS.seedText).forEach((part, i) => {
      seeds.push(i === 0 ? { ...s, text: part } : { ...s, id: uid(), text: part, createdAt: s.createdAt + i });
    });
  }
  return {
    ...db,
    seeds,
    items: db.items.map((i) => ({
      ...i,
      title: clamp(i.title, SERVER_CAPS.title),
      note: clamp(i.note, SERVER_CAPS.note),
      richBody: clampOrNull(i.richBody, SERVER_CAPS.richBody),
    })),
    actions: db.actions.map((a) => ({
      ...a,
      title: clamp(a.title, SERVER_CAPS.title),
      note: clamp(a.note, SERVER_CAPS.note),
    })),
    areas: db.areas.map((a) => ({
      ...a,
      description: a.description ? clamp(a.description, SERVER_CAPS.areaText) : a.description,
      whyItMatters: a.whyItMatters ? clamp(a.whyItMatters, SERVER_CAPS.areaText) : a.whyItMatters,
    })),
    reflections: db.reflections.map((r) => ({
      ...r,
      text: clamp(r.text, SERVER_CAPS.reflectionText),
      wins: clampLines(r.wins),
      lessons: clampLines(r.lessons),
      blockers: clampLines(r.blockers),
    })),
    journal: db.journal.map((j) => ({
      ...j,
      roughNotes: clamp(j.roughNotes, SERVER_CAPS.journalRough),
      endOfDay: clamp(j.endOfDay, SERVER_CAPS.journalEod),
      gratitude: j.gratitude ? clamp(j.gratitude, SERVER_CAPS.dailyExtra) : j.gratitude,
      intention: j.intention ? clamp(j.intention, SERVER_CAPS.dailyExtra) : j.intention,
      tags: j.tags?.slice(0, SERVER_CAPS.dayTags),
    })),
    habitDayNotes: db.habitDayNotes.map((n) => ({ ...n, text: clamp(n.text, SERVER_CAPS.habitDayNote) })),
  };
}
