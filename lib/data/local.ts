"use client";

import { DB, EMPTY_DB, TableName } from "../types";
import { Repo } from "./repo";

const KEY = "lifeos-db-v1";

export function readLocalDB(): DB {
  if (typeof window === "undefined") return EMPTY_DB;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(EMPTY_DB);
    const parsed = JSON.parse(raw) as Partial<DB>;
    return { ...structuredClone(EMPTY_DB), ...parsed };
  } catch {
    return structuredClone(EMPTY_DB);
  }
}

function writeLocalDB(db: DB) {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    // storage full / private mode — data stays in memory for the session
  }
}

export function clearLocalDB() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

export function localHasData(): boolean {
  const db = readLocalDB();
  return db.items.length + db.seeds.length + db.areas.length + db.actions.length > 0;
}

export class LocalRepo implements Repo {
  async load(): Promise<DB> {
    return readLocalDB();
  }

  async upsert<T extends TableName>(table: T, rows: DB[T][number][]): Promise<void> {
    const db = readLocalDB();
    const list = db[table] as { id: string }[];
    for (const row of rows as { id: string }[]) {
      const idx = list.findIndex((r) => r.id === row.id);
      if (idx >= 0) list[idx] = row;
      else list.push(row);
    }
    writeLocalDB(db);
  }

  async remove(table: TableName, ids: string[]): Promise<void> {
    const db = readLocalDB();
    const set = new Set(ids);
    const filtered = (db[table] as { id: string }[]).filter((r) => !set.has(r.id));
    (db as unknown as Record<TableName, unknown[]>)[table] = filtered;
    writeLocalDB(db);
  }
}
