"use client";

/**
 * Getting the bundle from wherever the data lives to the user's disk.
 *
 * Two sources, one shape. A signed-in account's rows come from GET /v1/export
 * (which returns the tables, both streams and the settings row); a signed-out
 * user's come straight out of this browser's own storage, minus the fields
 * that only ever existed on a server. Either way the same generator builds the
 * same files, so nobody gets a lesser export for keeping their data local.
 */

import { api } from "../api";
import { readLocalDB } from "../data/local";
import { readLocalStreams } from "../data/streams";
import { today } from "../dates";
import { DB, EMPTY_DB, EMPTY_SETTINGS, EMPTY_STREAMS, Streams, UserSettings } from "../types";
import { BundleFile, bundleFilename, buildBundle, BundleInput } from "./bundle";
import { ExportWindow } from "./window";
import { makeZip } from "./zip";

/** What GET /v1/export answers with. */
interface ServerExport {
  account?: { email?: string | null; createdAt?: string | null };
  settings?: Partial<UserSettings>;
  data?: Partial<DB> & Partial<Streams>;
}

export interface BundlePreview {
  files: BundleFile[];
  /** total characters across every file, for showing a size before download */
  totalBytes: number;
}

/** Gather everything the generator needs, from whichever source applies. */
export async function collectBundleInput(opts: {
  mode: "local" | "cloud";
  /** the device's own preferences, used when there is no server to ask */
  settings: UserSettings;
  email: string | null;
  /** narrow the bundle to one stretch of time; omit for everything */
  window?: ExportWindow | null;
}): Promise<BundleInput> {
  const generatedAt = Date.now();
  if (opts.mode === "cloud") {
    const remote = await api<ServerExport>("/v1/export");
    const data = remote.data ?? {};
    const { focusSessions, events, ...tables } = data;
    return {
      db: { ...structuredClone(EMPTY_DB), ...(tables as Partial<DB>) },
      streams: {
        focusSessions: focusSessions ?? [],
        events: events ?? [],
      },
      settings: { ...EMPTY_SETTINGS, ...(remote.settings ?? {}) },
      account: {
        email: remote.account?.email ?? opts.email,
        mode: "cloud",
        // when the account began, which no row can tell you: a life imported
        // from a device carries rows older than the account now holding them
        createdAt: remote.account?.createdAt ?? null,
      },
      generatedAt,
      today: today(),
      window: opts.window ?? null,
    };
  }
  return {
    // read from storage rather than from the provider's copy: the app filters
    // trashed items out of what it renders, and an export is the whole
    // record, not the view
    db: { ...structuredClone(EMPTY_DB), ...readLocalDB() },
    streams: { ...structuredClone(EMPTY_STREAMS), ...readLocalStreams() },
    settings: opts.settings,
    // device mode has no account, so no creation date to report
    account: { email: null, mode: "local", createdAt: null },
    generatedAt,
    today: today(),
    window: opts.window ?? null,
  };
}

/** Build the files without writing anything, so the UI can show what is in
 *  the bundle before the user commits to a download. */
export function previewBundle(input: BundleInput): BundlePreview {
  const files = buildBundle(input);
  return {
    files,
    totalBytes: files.reduce((sum, f) => sum + f.content.length, 0),
  };
}

/** Zip the files and hand them to the browser. */
export function downloadBundle(files: BundleFile[], generatedAt: number, window?: ExportWindow | null) {
  const zip = makeZip(files, new Date(generatedAt));
  // a fresh ArrayBuffer, because a Uint8Array view over a larger buffer would
  // hand Blob the wrong bytes
  const blob = new Blob([zip.slice().buffer as ArrayBuffer], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = bundleFilename(generatedAt, window);
  a.click();
  URL.revokeObjectURL(url);
}

/** Human-readable size for the "what's in here" card. */
export function prettyBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 102.4) / 10} KB`;
  return `${Math.round(n / (1024 * 102.4)) / 10} MB`;
}
