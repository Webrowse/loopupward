"use client";

import { useEffect, useState } from "react";
import { today } from "./dates";

/**
 * `today()` reads the local calendar day off `Date()` — during server
 * rendering (Cloudflare's edge, not the visitor's device) that reflects
 * wherever the server happens to sit, which is rarely the visitor's own
 * timezone. A visitor past midnight their time but before midnight UTC
 * would see yesterday baked into the first paint.
 *
 * This corrects to the browser's actual local day right after mount, and
 * keeps nudging forward on an interval so a tab left open across local
 * midnight rolls over on its own instead of staying stuck. Backgrounded
 * tabs throttle `setInterval` heavily, so a layout mounted before midnight
 * (like the sidebar, which persists across client-side navigations) can
 * sit stale for a while on its own — rechecking on visibility/focus catches
 * it up immediately instead of waiting on the throttled timer.
 */
export function useToday(): string {
  const [day, setDay] = useState(today);

  useEffect(() => {
    const check = () => {
      const now = today();
      setDay((prev) => (prev === now ? prev : now));
    };
    check();
    const id = setInterval(check, 60_000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, []);

  return day;
}
