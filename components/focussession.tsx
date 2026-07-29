"use client";

import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { useLife } from "@/lib/data/provider";
import { today } from "@/lib/dates";
import { todayEntries } from "@/lib/progress";
import { FocusTimer } from "@/components/focustimer";

interface FocusSessionValue {
  /** Put a row of some day on the timer. `autoRun` sends a routine straight
   *  into its step runner instead of the setup sheet. Asking for the row
   *  that's already running just brings it back to full screen. */
  openFocus: (entryId: string, opts?: { day?: string; autoRun?: boolean }) => void;
  /** the row the timer holds right now, minimized or not — null when idle */
  focusingId: string | null;
  minimized: boolean;
}

const FocusSessionContext = createContext<FocusSessionValue | null>(null);

export function useFocusSession(): FocusSessionValue {
  const ctx = useContext(FocusSessionContext);
  if (!ctx) throw new Error("useFocusSession must be used inside <FocusSessionHost>");
  return ctx;
}

interface Session {
  entryId: string;
  /** the day the timer is working against — ticks land here, not on whatever
   *  page happens to be open when the session ends */
  day: string;
  autoRun: boolean;
  /** bumped per session so a new one always mounts a clean timer */
  run: number;
}

/**
 * Hosts the focus timer above every page instead of inside one of them.
 *
 * A layout doesn't re-render on navigation, so a session started here keeps
 * ticking — and a routine keeps its place in its script — while you walk off
 * to write the daily note the routine just asked for. Minimized, the timer is
 * a small bar in the corner and the whole app stays usable underneath it.
 */
export function FocusSessionHost({ children }: { children: ReactNode }) {
  const { db, toggleEntry } = useLife();
  const [session, setSession] = useState<Session | null>(null);
  const [minimized, setMinimized] = useState(false);

  const openFocus = useCallback<FocusSessionValue["openFocus"]>((entryId, opts = {}) => {
    setMinimized(false);
    setSession((prev) =>
      prev && prev.entryId === entryId
        ? prev // already on the timer — the tap just means "show it to me"
        : { entryId, day: opts.day ?? today(), autoRun: !!opts.autoRun, run: (prev?.run ?? 0) + 1 }
    );
  }, []);

  const day = session?.day ?? null;
  const entries = useMemo(() => (day ? todayEntries(db, day) : []), [db, day]);

  const value = useMemo<FocusSessionValue>(
    () => ({ openFocus, focusingId: session?.entryId ?? null, minimized }),
    [openFocus, session, minimized]
  );

  return (
    <FocusSessionContext.Provider value={value}>
      {children}
      <FocusTimer
        key={session?.run ?? 0}
        open={!!session}
        entries={entries}
        initialEntryId={session?.entryId ?? null}
        autoRun={session?.autoRun ?? false}
        minimized={minimized}
        onMinimize={() => setMinimized(true)}
        onRestore={() => setMinimized(false)}
        onToggle={(entry) => toggleEntry(entry, day ?? today())}
        onClose={() => {
          setSession(null);
          setMinimized(false);
        }}
      />
    </FocusSessionContext.Provider>
  );
}
