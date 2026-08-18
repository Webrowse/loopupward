"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { useLife } from "@/lib/data/provider";
import { today } from "@/lib/dates";

/** One key, one value: the last local day this device announced itself. */
const OPENED_KEY = "lifeos-opened-day";

/**
 * Being here at all, recorded.
 *
 * There is no usage_days table: a day's opens, its first open, and the routes
 * walked are all derivable from these two events, and one append-only stream
 * is easier to trust than a counter that has to be read, incremented and
 * written back from two devices. The export's daily.csv does that derivation
 * (see appOpens / firstOpenLocal there), so the shape a reader sees is the
 * same either way — it is only the storage that is simpler.
 *
 * `app.opened` fires once per local day per device, which is enough to answer
 * "did I come back?" without turning a tab reload into a data point.
 * `page.viewed` fires on every route change, which is what makes "where do I
 * actually spend my time in here" answerable at all.
 */
export function UsagePulse() {
  const { emit, ready } = useLife();
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    const day = today();
    try {
      if (localStorage.getItem(OPENED_KEY) !== day) {
        localStorage.setItem(OPENED_KEY, day);
        emit("app.opened", { day });
      }
    } catch {
      // private mode: an un-deduped open is better than none
      emit("app.opened", { day });
    }
  }, [ready, emit]);

  useEffect(() => {
    if (!ready || !pathname) return;
    if (lastPath.current === pathname) return;
    const from = lastPath.current;
    lastPath.current = pathname;
    emit("page.viewed", { payload: { route: normalize(pathname), from: from ? normalize(from) : null } });
  }, [ready, pathname, emit]);

  return null;
}

/** Ids in a path say which note was open, which is a different question from
 *  which part of the app was in use — and one the item's own events already
 *  answer. Routes are recorded in their shape: /item/[id], not /item/9f3c… */
function normalize(path: string): string {
  return path.replace(/\/[0-9a-f-]{8,}(?=\/|$)/gi, "/[id]");
}
