"use client";

import { api } from "../api";
import { DB, EMPTY_DB, TableName } from "../types";
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

  /** Push an entire on-device DB into the cloud (first sign-in migration). */
  async importAll(db: DB): Promise<void> {
    await api("/v1/import", { method: "POST", body: db });
  }
}
