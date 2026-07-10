"use client";

import { useEffect, useReducer, useSyncExternalStore } from "react";
import { today } from "./dates";

function subscribe(onChange: () => void) {
  const id = setInterval(onChange, 60_000);
  document.addEventListener("visibilitychange", onChange);
  window.addEventListener("focus", onChange);
  return () => {
    clearInterval(id);
    document.removeEventListener("visibilitychange", onChange);
    window.removeEventListener("focus", onChange);
  };
}

/**
 * `today()` reads the local calendar day off `Date()` — during server
 * rendering (Cloudflare's edge, not the visitor's device) that reflects
 * wherever the server happens to sit, which is rarely the visitor's own
 * timezone, and a statically prerendered page bakes that server-side value
 * in until the next deploy. `useSyncExternalStore` re-reads `today()` on
 * every render and re-renders whenever the store notifies a change.
 *
 * On the very first client render the snapshot is already correct — but
 * React's hydration pass only patches mismatched text nodes, not attributes
 * like `className`, so a server-baked "yesterday" highlight can survive on
 * screen even though the value React holds internally is already right.
 * The forced update below runs once, right after mount, so React performs
 * one genuine reconciliation pass (not a hydration adoption) that flushes
 * the already-correct value into the DOM.
 */
export function useToday(): string {
  const day = useSyncExternalStore(subscribe, today, today);
  const [, forceUpdate] = useReducer((n: number) => n + 1, 0);
  useEffect(() => forceUpdate(), [forceUpdate]);
  return day;
}
