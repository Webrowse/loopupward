"use client";

/**
 * Watching a timer attempt so the record of it survives the attempt.
 *
 * Focus time used to be thrown away entirely: the day-run plan was never
 * written anywhere, and `elapsed` was UI state. Routines counted their steps'
 * *estimates* down and kept none of the actual seconds, pauses, skips or
 * abandonments. This is the missing half.
 *
 * Two rules, both load-bearing:
 *
 *  1. **Wall clock only.** Every duration in here is a difference of
 *     Date.now() stamps. Browsers throttle background-tab intervals to about
 *     once a minute, so anything that counted ticks would quietly under-report
 *     exactly the sessions where the user walked away — the ones worth seeing.
 *  2. **Every attempt ends.** Completed, closed, skipped, swapped away from,
 *     or left running past its deadline: all five get a row. Abandonment data
 *     is more interesting than completion data, and it only exists if failure
 *     is recorded as deliberately as success.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { FocusKind, FocusOutcome, FocusSession } from "./types";

export interface AttemptInit {
  kind: FocusKind;
  itemId: string | null;
  /** the Today row this started from — real action id, or a virtual one */
  entryId: string;
  /** the day it belongs to, which for a wrapped night routine is yesterday */
  day: string;
  stepId?: string | null;
  /** what was asked for; null means untimed, counted up instead */
  plannedSeconds: number | null;
}

/** What recordSession() wants: everything but the bookkeeping the provider adds. */
export type RecordedSession = Omit<FocusSession, "id" | "createdAt" | "tz" | "utcOffsetMinutes">;

export class Attempt {
  readonly startedAt = Date.now();
  private pausedSince: number | null = null;
  private pausedMs = 0;
  private pauses = 0;
  private ended = false;
  private init: AttemptInit;

  constructor(init: AttemptInit) {
    this.init = init;
  }

  /** A step that arrived without a length and was given one on screen. */
  setPlanned(seconds: number | null) {
    this.init = { ...this.init, plannedSeconds: seconds };
  }

  pause() {
    if (this.ended || this.pausedSince !== null) return;
    this.pausedSince = Date.now();
    this.pauses += 1;
  }

  resume() {
    if (this.ended || this.pausedSince === null) return;
    this.pausedMs += Date.now() - this.pausedSince;
    this.pausedSince = null;
  }

  /** Closes the attempt and returns the row for it — or null if it was
   *  already closed, so the same attempt can never be written twice (a
   *  finish followed by an unmount is the normal case, not an error). */
  end(outcome: FocusOutcome, at = Date.now()): RecordedSession | null {
    if (this.ended) return null;
    this.ended = true;
    const pausedMs = this.pausedMs + (this.pausedSince !== null ? at - this.pausedSince : 0);
    const wallMs = Math.max(0, at - this.startedAt);
    return {
      itemId: this.init.itemId,
      entryId: this.init.entryId,
      day: this.init.day,
      kind: this.init.kind,
      stepId: this.init.stepId ?? null,
      startedAt: this.startedAt,
      endedAt: at,
      plannedSeconds: this.init.plannedSeconds,
      // time actually spent on it: the clock, minus however long it sat paused
      actualSeconds: Math.round(Math.max(0, wallMs - pausedMs) / 1000),
      pausedSeconds: Math.round(pausedMs / 1000),
      pauseCount: this.pauses,
      outcome,
    };
  }
}

/**
 * One attempt at a time, held in a ref so that starting, pausing or ending it
 * never re-renders the screen it is measuring.
 *
 * Whatever is still open when the component goes away is written as
 * `abandoned` — closing the tab mid-session is exactly the case the old code
 * lost, so it is the case this one is built around.
 */
export function useAttempt(record: (session: RecordedSession) => void) {
  const current = useRef<Attempt | null>(null);
  const recordRef = useRef(record);
  useEffect(() => {
    recordRef.current = record;
  });

  const end = useCallback((outcome: FocusOutcome) => {
    const row = current.current?.end(outcome);
    current.current = null;
    if (row) recordRef.current(row);
  }, []);

  /** Start a new attempt, closing whatever was running with `previous`. */
  const begin = useCallback(
    (init: AttemptInit, previous: FocusOutcome = "interrupted") => {
      if (current.current) end(previous);
      current.current = new Attempt(init);
    },
    [end]
  );

  const pause = useCallback(() => current.current?.pause(), []);
  const resume = useCallback(() => current.current?.resume(), []);
  const setPlanned = useCallback((seconds: number | null) => current.current?.setPlanned(seconds), []);
  const isOpen = useCallback(() => current.current !== null, []);

  useEffect(
    () => () => {
      const row = current.current?.end("abandoned");
      current.current = null;
      if (row) recordRef.current(row);
    },
    []
  );

  // one stable object for the life of the component: callers put it in effect
  // dependency arrays, and a fresh object each render would reinstall their
  // listeners on every tick of the clock they are watching
  return useMemo(
    () => ({ begin, end, pause, resume, setPlanned, isOpen }),
    [begin, end, pause, resume, setPlanned, isOpen]
  );
}
