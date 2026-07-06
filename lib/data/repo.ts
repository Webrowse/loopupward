import { DB, TableName } from "../types";

/**
 * Storage backend. The in-memory DB is the source of truth for the UI;
 * repos persist mutations. LocalRepo keeps everything on-device,
 * SupabaseRepo syncs to the user's private cloud rows.
 */
export interface Repo {
  load(): Promise<DB>;
  upsert<T extends TableName>(table: T, rows: DB[T][number][]): Promise<void>;
  remove(table: TableName, ids: string[]): Promise<void>;
}
