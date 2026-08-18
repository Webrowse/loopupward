"use client";

/**
 * The two append-only capture streams: behavioural events, and focus sessions.
 *
 * They are deliberately NOT part of DB. Nothing on screen reads them, so they
 * must never take part in a React render, never be shipped down the wire on a
 * page load, and never sit in the path of a user's tap. What they get instead
 * is this: an in-memory buffer, flushed on a timer and whenever the page is
 * about to go away.
 *
 * Two rules hold everywhere in here:
 *
 *   1. A write must never fail the user's actual action. Every flush swallows
 *      its errors — a lost event is a lost event; a lost checkbox is a bug.
 *   2. Batch. A ten-step routine is one request, not eleven.
 */

import { api, apiConfigured, getToken } from "../api";
import { AppEvent, EMPTY_STREAMS, FocusSession, Streams } from "../types";

const KEY = "lifeos-streams-v1";

/* ————— where the rows land ————— */

export interface StreamSink {
  append(rows: Streams): Promise<void>;
}

export function readLocalStreams(): Streams {
  if (typeof window === "undefined") return structuredClone(EMPTY_STREAMS);
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(EMPTY_STREAMS);
    const parsed = JSON.parse(raw) as Partial<Streams>;
    return { ...structuredClone(EMPTY_STREAMS), ...parsed };
  } catch {
    return structuredClone(EMPTY_STREAMS);
  }
}

export function clearLocalStreams() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

export class LocalStreamSink implements StreamSink {
  async append(rows: Streams): Promise<void> {
    const cur = readLocalStreams();
    cur.events.push(...rows.events);
    cur.focusSessions.push(...rows.focusSessions);
    try {
      localStorage.setItem(KEY, JSON.stringify(cur));
    } catch {
      // storage full / private mode. The streams are the observational
      // record, not the user's content — dropping the tail of them is the
      // right thing to lose, and silently, rather than breaking a save.
    }
  }
}

/** The server caps a batch at 500 rows per request. */
const MAX_BATCH = 500;

function chunks<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

export class CloudStreamSink implements StreamSink {
  async append(rows: Streams): Promise<void> {
    for (const batch of chunks(rows.events, MAX_BATCH)) {
      await api("/v1/data/events", { method: "PUT", body: { rows: batch } });
    }
    for (const batch of chunks(rows.focusSessions, MAX_BATCH)) {
      await api("/v1/data/focusSessions", { method: "PUT", body: { rows: batch } });
    }
  }
}

/* ————— the buffer ————— */

/** How long a row may sit unwritten. Long enough that a routine's ten steps
 *  leave as one request, short enough that closing the tab rarely beats it
 *  (and pagehide flushes anyway). */
const FLUSH_MS = 4_000;
/** A burst big enough to be worth sending immediately. */
const FLUSH_AT = 100;

export class StreamWriter {
  private buffer: Streams = { focusSessions: [], events: [] };
  private timer: ReturnType<typeof setTimeout> | null = null;
  private sink: StreamSink = new LocalStreamSink();
  private detach: (() => void) | null = null;

  /** Point the writer at wherever this session's rows belong. Anything
   *  already buffered goes to the new sink, which is correct: the rows were
   *  written by this user either way. */
  setSink(sink: StreamSink) {
    this.sink = sink;
  }

  /** Flush on the way out. The page going away is the one moment a buffered
   *  row is actually at risk, so both signals are listened for: pagehide
   *  fires on iOS where unload does not. */
  start() {
    if (typeof window === "undefined" || this.detach) return;
    const onLeave = () => this.flush();
    const onHide = () => {
      if (document.visibilityState === "hidden") this.flush();
    };
    window.addEventListener("pagehide", onLeave);
    document.addEventListener("visibilitychange", onHide);
    this.detach = () => {
      window.removeEventListener("pagehide", onLeave);
      document.removeEventListener("visibilitychange", onHide);
    };
  }

  stop() {
    this.detach?.();
    this.detach = null;
    this.flush();
  }

  event(e: AppEvent) {
    this.buffer.events.push(e);
    this.schedule();
  }

  session(s: FocusSession) {
    this.buffer.focusSessions.push(s);
    this.schedule();
  }

  private schedule() {
    if (this.buffer.events.length + this.buffer.focusSessions.length >= FLUSH_AT) {
      this.flush();
      return;
    }
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), FLUSH_MS);
  }

  /** Hand everything buffered to the sink. Fire-and-forget by design: the
   *  caller is a click handler, and it has already returned. */
  flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const rows = this.buffer;
    if (rows.events.length + rows.focusSessions.length === 0) return;
    this.buffer = { focusSessions: [], events: [] };
    this.sink.append(rows).catch((e) => {
      // Never surfaced and never retried into a loop: the streams are how the
      // app watches itself, and self-observation does not get to interrupt
      // the thing being observed.
      console.warn("[lifeos] stream flush failed", e);
    });
  }
}

/** The sink this session should use: the cloud when signed in, this device
 *  otherwise — the same rule the main repo follows. */
export function sinkFor(signedIn: boolean): StreamSink {
  return signedIn && apiConfigured() && getToken() ? new CloudStreamSink() : new LocalStreamSink();
}
