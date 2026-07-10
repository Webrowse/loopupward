"use client";

import { useSyncExternalStore } from "react";
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
 * every render and re-renders whenever the store notifies a change (a
 * timer tick, or the tab regaining visibility/focus).
 */
export function useToday(): string {
  return useSyncExternalStore(subscribe, today, today);
}
