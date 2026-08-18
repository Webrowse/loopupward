"use client";

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import {
  api, ApiRequestError, apiConfigured, ApiUser, clearToken, getToken,
} from "../api";
import {
  Action, Area, AppEvent, DB, EMPTY_DB, EMPTY_SETTINGS, EventType, FocusSession, HabitDayNote,
  DEFAULT_DAY_ROLLOVER_HOUR, Item, JournalEntry, Label, LogSource, Reflection, Seed, SeedStatus,
  TableName, UserSettings,
} from "../types";
import { uid } from "../uid";
import { CloudRepo } from "./cloud";
import { LocalRepo, clearLocalDB, localHasData, readLocalDB } from "./local";
import { clearLocalStreams, readLocalStreams, sinkFor, StreamWriter } from "./streams";
import { Repo } from "./repo";
import { currentTimezone, stamp } from "../clock";
import { actionChangeEvents, itemChangeEvents } from "./changes";
import { today } from "../dates";
import { dayLogged, habitDailyTarget, linkKind, requiredSteps, routineLogDay, TodayEntry } from "../progress";
import { FREE_LIMITS, PREMIUM_TRASH_DAYS } from "../limits";
import { DEFAULT_FONT, FontId, isFontId } from "../fonts";

/** Where a progress value came from, passed down from whichever control
 *  wrote it. Every log row carries this now — a manual tick and a routine's
 *  auto-log used to be indistinguishable after the fact. */
export interface LogOrigin {
  source?: LogSource;
  via?: string;
}

export interface EmitOptions {
  itemId?: string | null;
  payload?: Record<string, unknown>;
  /** the local day this belongs to, when it is not the calendar day (a night
   *  routine ticked at 1am belongs to the evening before) */
  day?: string;
}

interface LifeContextValue {
  ready: boolean;
  db: DB;
  mode: "local" | "cloud";
  cloudAvailable: boolean;
  user: ApiUser | null;
  premium: boolean;
  owner: boolean;
  limits: { canAddArea: boolean; canAddItem: boolean };
  syncError: string | null;
  dismissSyncError: () => void;
  theme: "light" | "dark";
  setTheme: (t: "light" | "dark") => void;
  font: FontId;
  setFont: (f: FontId) => void;
  /** Simple mode hides the advanced planning machinery (kinds, trackers,
   *  horizons) from creation flows and the nav — the full app keeps working
   *  underneath, nothing is deleted or disabled. */
  simple: boolean;
  setSimple: (v: boolean) => void;
  /** Seconds of breather the focus timer inserts before the next task or
   *  routine step starts (0 = none). A skippable countdown, remembered here. */
  restSeconds: number;
  setRestSeconds: (v: number) => void;
  /** Preferences and context, server-owned when signed in (localStorage stays
   *  the offline cache and the anti-FOUC boot value). Nothing in here gates a
   *  feature: it exists to make an exported year readable a year later. */
  settings: UserSettings;
  updateSettings: (patch: Partial<UserSettings>) => void;

  /** Record one behavioural fact. Fire-and-forget: buffered, batched, and
   *  never in the path of the interaction that caused it. Most events are
   *  emitted from the mutations below — this is for the ones only a screen
   *  can see, like a routine step skipped or a day run abandoned. */
  emit: (type: EventType, opts?: EmitOptions) => void;
  /** Record one finished timer attempt — completed, abandoned or otherwise. */
  recordSession: (session: Omit<FocusSession, "id" | "createdAt" | "tz" | "utcOffsetMinutes">) => void;
  /** Write out anything still buffered and wait for it to land. Only the
   *  export needs this: a bundle built seconds after a routine must contain
   *  that routine, not the state of the world four seconds ago. */
  flushStreams: () => Promise<void>;
  /** Pull the freshest data from wherever it lives (cloud rows, or this
   *  device's store) without reloading the page — phone edits show up on
   *  the laptop. Also runs by itself when the tab regains focus. */
  refresh: () => Promise<void>;
  syncing: boolean;
  /** Suspend the automatic tab-return refresh while focused work is on screen
   *  (the timer runs full-screen and writes step ticks as you go — a refresh
   *  replacing the whole db underneath it could drop those). Returns a release
   *  function; call it when the work closes. */
  holdSync: () => () => void;

  addSeed: (text: string) => Seed;
  updateSeed: (id: string, text: string) => void;
  setSeedStatus: (id: string, status: SeedStatus) => void;
  deleteSeed: (id: string) => void;
  plantSeed: (seed: Seed, item: Item) => void;
  unplantSeed: (seedId: string, itemId: string) => void;

  saveJournal: (date: string, patch: Partial<Omit<JournalEntry, "id" | "date" | "createdAt" | "updatedAt">>) => void;

  addLabel: (name: string, emoji: string, color: string) => Label | null;
  updateLabel: (id: string, patch: Partial<Label>) => void;
  deleteLabel: (id: string) => void;

  addArea: (name: string, emoji: string, color: string) => Area | null;
  updateArea: (id: string, patch: Partial<Area>) => void;
  deleteArea: (id: string) => void;

  addItem: (partial: Partial<Item> & { title: string }, opts?: { origin?: string }) => Item | null;
  updateItem: (id: string, patch: Partial<Item>) => void;
  moveItem: (id: string, dest: { areaId?: string | null; parentId?: string | null }) => void;
  /** moves the item to Trash rather than destroying it outright */
  deleteItem: (id: string) => void;
  /** items currently in Trash, most recently deleted first */
  trashedItems: Item[];
  /** brings a trashed item back to where it can be seen again */
  restoreItem: (id: string) => void;
  /** destroys a trashed item for good, ahead of its retention window */
  purgeItem: (id: string) => void;
  completeItem: (id: string) => void;
  reopenItem: (id: string) => void;
  setTracker: (item: Item, value: number, opts?: LogOrigin) => void;

  addAction: (
    title: string,
    date: string,
    itemId?: string | null,
    amount?: number,
    opts?: { priority?: number; note?: string; origin?: string }
  ) => void;
  updateAction: (id: string, patch: Partial<Action>) => void;
  deleteAction: (id: string) => void;
  toggleEntry: (entry: TodayEntry, day?: string, opts?: LogOrigin) => void;
  /** Log or unlog one habit occurrence for a single day — distinct from
   *  completeItem, which retires the habit for good. */
  /** `skipLinked` is internal plumbing: it stops the two halves of a linked
   *  routine step writing to each other in a circle. */
  toggleHabitDay: (item: Item, day: string, currentlyDone: boolean, skipLinked?: boolean, opts?: LogOrigin) => void;
  /** Tick one step of a routine's script for a single day. Checking the
   *  last open step logs the routine's day (same as toggleHabitDay);
   *  unchecking a step on a fully-done day un-logs it again. */
  setRoutineStepDone: (item: Item, day: string, stepId: string, done: boolean, skipLinked?: boolean) => void;
  /** Persist a manual drag order for one day's Today list. Completing a
   *  task never calls this — only dragging, or the "Sort" tidy-up, does. */
  reorderDay: (day: string, orderedEntryIds: string[], via?: "drag" | "sort") => void;

  saveReflection: (
    period: Reflection["period"],
    periodKey: string,
    patch: Partial<Omit<Reflection, "id" | "period" | "periodKey" | "createdAt" | "updatedAt">>
  ) => void;

  /** empty text removes the day's plan entirely */
  setHabitDayNote: (itemId: string, date: string, text: string) => void;

  signOut: () => Promise<void>;
}

/** New key — the three that must never be renamed (lifeos-token,
 *  lifeos-db-v1, lifeos-theme) are untouched. */
const SETTINGS_KEY = "lifeos-settings-v1";

/** The settings that shape how a day is read, as opposed to how the app looks.
 *  Only these get a change event: a theme toggle is not a fact about a life,
 *  and logging it would bury the ones that are. Moving your rollover hour or
 *  your timezone changes what every later row means, so both are dated. */
const CONTEXT_FIELDS = [
  "timezone", "dayRolloverHour",
] as const satisfies readonly (keyof UserSettings)[];

/** Event payloads are capped server-side, and two 4,000-character answers
 *  would not fit. Long prose is clipped with a flag rather than dropped, so a
 *  reader always knows whether they are holding the whole sentence. */
const MAX_CONTEXT_EVENT_CHARS = 1_000;
function clipValue(v: unknown): unknown {
  if (typeof v !== "string" || v.length <= MAX_CONTEXT_EVENT_CHARS) return v;
  return `${v.slice(0, MAX_CONTEXT_EVENT_CHARS)}…[clipped ${v.length} chars]`;
}

const LifeContext = createContext<LifeContextValue | null>(null);

export function useLife(): LifeContextValue {
  const ctx = useContext(LifeContext);
  if (!ctx) throw new Error("useLife must be used inside <LifeProvider>");
  return ctx;
}

export function LifeProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<DB>(EMPTY_DB);
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<ApiUser | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [theme, setThemeState] = useState<"light" | "dark">("light");
  const [font, setFontState] = useState<FontId>(DEFAULT_FONT);
  const [simple, setSimpleState] = useState(false);
  const [restSeconds, setRestSecondsState] = useState(5);
  const [settings, setSettingsState] = useState<UserSettings>(EMPTY_SETTINGS);
  const repoRef = useRef<Repo>(new LocalRepo());
  const cloudAvailable = apiConfigured();
  const mode: "local" | "cloud" = user ? "cloud" : "local";

  /* ————— the capture streams —————
   * One writer for the session, living in a ref so that recording a fact
   * never re-renders anything. See lib/data/streams.ts for why. */
  const writerRef = useRef<StreamWriter | null>(null);
  if (writerRef.current === null) writerRef.current = new StreamWriter();
  useEffect(() => {
    const w = writerRef.current!;
    w.start();
    return () => w.stop();
  }, []);
  useEffect(() => {
    writerRef.current!.setSink(sinkFor(!!user));
  }, [user]);

  /** The hour a day rolls over, from settings — the rule that decides which
   *  day a wrapped routine's late-night tick belongs to. */
  const rolloverHour = settings.dayRolloverHour ?? DEFAULT_DAY_ROLLOVER_HOUR;

  const emit = useCallback((type: EventType, opts: EmitOptions = {}) => {
    const st = stamp(opts.day);
    const event: AppEvent = {
      id: uid(),
      at: st.at,
      day: st.day,
      tz: st.tz,
      utcOffsetMinutes: st.utcOffsetMinutes,
      type,
      itemId: opts.itemId ?? null,
      payload: opts.payload ?? {},
      createdAt: st.at,
    };
    writerRef.current!.event(event);
  }, []);

  const flushStreams = useCallback(() => writerRef.current!.flush(), []);

  const recordSession = useCallback(
    (session: Omit<FocusSession, "id" | "createdAt" | "tz" | "utcOffsetMinutes">) => {
      const st = stamp(session.day, session.endedAt);
      writerRef.current!.session({
        ...session,
        id: uid(),
        tz: st.tz,
        utcOffsetMinutes: st.utcOffsetMinutes,
        createdAt: Date.now(),
      });
    },
    []
  );

  /* ————— settings & context —————
   *
   * Server-owned once signed in, with localStorage as the offline cache and
   * the anti-FOUC boot value (app/layout.tsx reads lifeos-theme before React
   * exists — renaming that key would sign a user out of their own theme).
   * The server wins on load; every edit writes through to both.
   *
   * Declared above the individual preference setters because every one of
   * them writes through to here.
   */
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  const updateSettings = useCallback((patch: Partial<UserSettings>) => {
    // Who this person says they are is a single mutable row, so an export taken
    // years later could only ever show the FINAL answer — and testing 2026
    // behaviour against a 2031 self-description invents a divergence that never
    // happened. One event per changed field records the answer as it was given.
    // Only the fields that describe a person and their clock: theme and font
    // churn would be noise, and say nothing about a life.
    //
    // Diffed out here rather than inside the state updater below: React invokes
    // an updater twice under StrictMode, and an updater that emits would record
    // every context change twice in development.
    const before = settingsRef.current;
    for (const field of CONTEXT_FIELDS) {
      if (!(field in patch)) continue;
      const was = before[field];
      const now = patch[field] ?? null;
      if (was === now) continue;
      emit("settings.changed", {
        payload: {
          field,
          // the new value in full (clipped only if someone writes an essay);
          // the previous one is the previous event's `to`, so it is not
          // repeated here and the payload stays well inside its size cap
          to: clipValue(now),
          toChars: typeof now === "string" ? now.length : null,
          fromChars: typeof was === "string" ? was.length : null,
          hadPrevious: was !== null && was !== undefined && was !== "",
        },
      });
    }
    setSettingsState((prev) => {
      const next = { ...prev, ...patch, updatedAt: Date.now() };
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch {}
      if (getToken() && apiConfigured()) {
        // fire-and-forget: a preference failing to reach the cloud must not
        // block the screen that changed it — the device copy is authoritative
        // until the next successful write
        api("/v1/settings", { method: "PUT", body: next }).catch((e) => {
          console.warn("[lifeos] settings save failed", e);
        });
      }
      return next;
    });
  }, [emit]);

  /* ————— what this device already knows —————
   *
   * One pass, after mount rather than during render: the server's HTML cannot
   * see localStorage, so reading it any earlier would hand React two
   * different first renders. The boot script in app/layout.tsx has already
   * put theme and font on <html> by the time this runs — this is where React
   * catches up with it.
   */
  useEffect(() => {
    setThemeState(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
    try {
      setSimpleState(localStorage.getItem("lifeos-simple") === "1");
      const rest = localStorage.getItem("lifeos-rest");
      if (rest !== null) {
        const n = parseInt(rest, 10);
        if (Number.isFinite(n) && n >= 0) setRestSecondsState(Math.min(600, n));
      }
      const cached = localStorage.getItem(SETTINGS_KEY);
      if (cached) {
        setSettingsState({ ...EMPTY_SETTINGS, ...(JSON.parse(cached) as Partial<UserSettings>) });
      }
    } catch {}
  }, []);

  /* ————— theme ————— */
  const setTheme = useCallback((t: "light" | "dark") => {
    setThemeState(t);
    document.documentElement.dataset.theme = t === "dark" ? "dark" : "";
    try { localStorage.setItem("lifeos-theme", t); } catch {}
    updateSettings({ theme: t });
  }, [updateSettings]);

  /* ————— display font ————— */
  useEffect(() => {
    const syncFont = () => {
      const attr = document.documentElement.dataset.font;
      setFontState(isFontId(attr) ? attr : DEFAULT_FONT);
    };
    syncFont();
  }, []);
  const setFont = useCallback((f: FontId) => {
    setFontState(f);
    document.documentElement.dataset.font = f;
    try { localStorage.setItem("lifeos-font", f); } catch {}
    updateSettings({ font: f });
  }, [updateSettings]);

  /* ————— simple mode ————— */
  const setSimple = useCallback((v: boolean) => {
    setSimpleState(v);
    try { localStorage.setItem("lifeos-simple", v ? "1" : "0"); } catch {}
    updateSettings({ simple: v });
  }, [updateSettings]);

  /* ————— rest between focus tasks/steps ————— */
  const setRestSeconds = useCallback((v: number) => {
    const n = Math.max(0, Math.min(600, Math.round(v)));
    setRestSecondsState(n);
    try { localStorage.setItem("lifeos-rest", String(n)); } catch {}
    updateSettings({ restSeconds: n });
  }, [updateSettings]);


  /**
   * Take the server's copy on load. Applied straight to the underlying
   * preference state rather than through the setters, because the setters
   * write back — and a load that immediately re-uploads what it just read is
   * a loop, not a sync.
   *
   * A timezone the server does not have yet is filled in from the browser and
   * written once. Without it no exported timestamp can be read across travel
   * or DST, which is the whole reason the column exists.
   */
  const applyServerSettings = useCallback((remote: UserSettings) => {
    const merged: UserSettings = { ...EMPTY_SETTINGS, ...remote };
    if (!merged.timezone) merged.timezone = currentTimezone() || null;
    if (merged.theme === "dark" || merged.theme === "light") {
      setThemeState(merged.theme);
      document.documentElement.dataset.theme = merged.theme === "dark" ? "dark" : "";
      try { localStorage.setItem("lifeos-theme", merged.theme); } catch {}
    }
    if (isFontId(merged.font)) {
      setFontState(merged.font);
      document.documentElement.dataset.font = merged.font;
      try { localStorage.setItem("lifeos-font", merged.font); } catch {}
    }
    if (merged.simple !== null) {
      setSimpleState(merged.simple);
      try { localStorage.setItem("lifeos-simple", merged.simple ? "1" : "0"); } catch {}
    }
    if (merged.restSeconds !== null) {
      setRestSecondsState(Math.max(0, Math.min(600, merged.restSeconds)));
      try { localStorage.setItem("lifeos-rest", String(merged.restSeconds)); } catch {}
    }
    setSettingsState(merged);
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged)); } catch {}
    if (!remote.timezone && merged.timezone) {
      api("/v1/settings", { method: "PUT", body: merged }).catch(() => {});
    }
  }, []);

  /* ————— session & data bootstrap ————— */
  useEffect(() => {
    let cancelled = false;

    async function boot() {
      if (apiConfigured() && getToken()) {
        try {
          const me = await api<ApiUser>("/v1/me");
          const cloud = new CloudRepo();
          let data = await cloud.load();
          const empty =
            data.items.length + data.seeds.length + data.areas.length + data.actions.length === 0;
          if (empty && localHasData()) {
            // first sign-in: carry the on-device life into the cloud. If the
            // import fails, the failure is the import's — not the session's:
            // stay signed in, keep the device data safe where it is, and say
            // so. (This used to throw to the outer catch, which read as
            // "cloud unreachable" and left the user silently signed out.)
            try {
              const local = readLocalDB();
              // the on-device capture streams travel with the life they
              // describe — a year of focus sessions is not something to
              // leave behind on one browser
              await cloud.importAll(local, readLocalStreams());
              data = await cloud.load();
              clearLocalDB();
              clearLocalStreams();
            } catch (e) {
              console.error("[lifeos] first sign-in import failed", e);
              if (!cancelled) {
                setSyncError(
                  "Signed in, but this device's data couldn't be carried into your cloud yet. It's still safe on this device."
                );
              }
            }
          }
          if (!cancelled) {
            repoRef.current = cloud;
            setUser(me);
            setDb(data);
            setReady(true);
          }
          // settings are the server's copy of who this person is — fetched
          // after the data so a slow settings call never delays the app, and
          // applied over the device cache because the server wins on load
          api<UserSettings>("/v1/settings")
            .then((remote) => {
              if (cancelled) return;
              applyServerSettings(remote);
            })
            .catch(() => {
              // the device cache is a perfectly good fallback
            });
          return;
        } catch (e) {
          if (e instanceof ApiRequestError && e.status === 401) {
            clearToken(); // session expired — fall back to device mode
          } else {
            console.error("[lifeos] cloud boot failed", e);
            if (!cancelled) {
              setSyncError("Couldn't reach your cloud — working on this device for now.");
            }
          }
        }
      }
      if (!cancelled) {
        repoRef.current = new LocalRepo();
        setUser(null);
        setDb(readLocalDB());
        setReady(true);
      }
    }

    boot();
    return () => { cancelled = true; };
  }, [applyServerSettings]);

  /* ————— persistence helpers ————— */
  // writes still on their way to the repo — a refresh while one is in
  // flight could pull a snapshot from just before it and clobber the
  // change on screen, so refresh waits these out
  const pendingWrites = useRef(0);
  const persist = useCallback((fn: (repo: Repo) => Promise<void>) => {
    pendingWrites.current += 1;
    fn(repoRef.current)
      .catch((e) => {
        console.error("[lifeos] sync failed", e);
        if (e instanceof ApiRequestError && e.code === "limit") {
          setSyncError(e.message);
        } else {
          setSyncError("A change couldn't be saved to the cloud. It's still on this device — refresh to retry.");
        }
      })
      .finally(() => {
        pendingWrites.current -= 1;
      });
  }, []);

  /* ————— pull-to-fresh: manual button + automatic on returning to the tab ————— */
  const [syncing, setSyncing] = useState(false);
  const readyRef = useRef(false);
  useEffect(() => { readyRef.current = ready; }, [ready]);
  const lastRefreshRef = useRef(0);

  // held while a focus timer / routine runner is open — see holdSync
  const syncHolds = useRef(0);
  const holdSync = useCallback(() => {
    syncHolds.current += 1;
    return () => { syncHolds.current = Math.max(0, syncHolds.current - 1); };
  }, []);

  const refresh = useCallback(async () => {
    if (!readyRef.current || pendingWrites.current > 0 || syncHolds.current > 0) return;
    setSyncing(true);
    lastRefreshRef.current = Date.now();
    try {
      const data = await repoRef.current.load();
      // a write may have started while the load was in the air — its
      // optimistic state is newer than this snapshot, keep it instead
      if (pendingWrites.current === 0) {
        setDb(data);
        setSyncError(null);
      }
    } catch (e) {
      console.error("[lifeos] refresh failed", e);
      setSyncError("Couldn't fetch the latest. Check your connection and try again.");
    } finally {
      setSyncing(false);
    }
  }, []);

  // coming back to the app (phone → laptop, or another tab) pulls what
  // changed elsewhere, at most once a minute — the button covers "now!"
  useEffect(() => {
    const onReturn = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastRefreshRef.current < 60_000) return;
      refresh();
    };
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, [refresh]);

  const upsertRows = useCallback(
    <T extends TableName>(table: T, rows: DB[T][number][]) => {
      setDb((prev) => {
        const list = [...(prev[table] as { id: string }[])];
        for (const row of rows as { id: string }[]) {
          const idx = list.findIndex((r) => r.id === row.id);
          if (idx >= 0) list[idx] = row;
          else list.push(row);
        }
        return { ...prev, [table]: list };
      });
      persist((repo) => repo.upsert(table, rows));
    },
    [persist]
  );

  const removeRows = useCallback(
    (table: TableName, ids: string[]) => {
      const set = new Set(ids);
      setDb((prev) => ({
        ...prev,
        [table]: (prev[table] as { id: string }[]).filter((r) => !set.has(r.id)),
      }));
      persist((repo) => repo.remove(table, ids));
    },
    [persist]
  );

  /* ————— derived ————— */
  const premium = user?.premium ?? false;
  const owner = user?.role === "owner";
  const limits = useMemo(() => {
    const activeItems = db.items.filter((i) => i.status === "active" && !i.deletedAt).length;
    return {
      canAddArea: premium || db.areas.length < FREE_LIMITS.areas,
      canAddItem: premium || activeItems < FREE_LIMITS.activeItems,
    };
  }, [db, premium]);

  // trashed items are kept around (for restore/the retention sweep) but
  // hidden from every normal view — filtered once here rather than at each
  // of the many call sites that read db.items directly
  const visibleDb = useMemo(() => {
    const trashed = new Set(db.items.filter((i) => i.deletedAt).map((i) => i.id));
    if (trashed.size === 0) return db;
    // a trashed item's actions and logs are kept for restore (see deleteItem)
    // but must not reach a single screen: Today, streaks and every progress
    // number behave exactly as they did when these rows were destroyed outright
    return {
      ...db,
      items: db.items.filter((i) => !i.deletedAt),
      actions: db.actions.filter((a) => !a.itemId || !trashed.has(a.itemId)),
      logs: db.logs.filter((l) => !trashed.has(l.itemId)),
      habitDayNotes: db.habitDayNotes.filter((n) => !trashed.has(n.itemId)),
    };
  }, [db]);

  /* ————— seeds ————— */
  const addSeed = useCallback((text: string): Seed => {
    const seed: Seed = {
      id: uid(), text: text.trim(), createdAt: Date.now(),
      itemId: null, archivedAt: null, status: "inbox",
    };
    upsertRows("seeds", [seed]);
    emit("seed.captured", { payload: { seedId: seed.id, length: seed.text.length } });
    return seed;
  }, [upsertRows, emit]);

  const updateSeed = useCallback((id: string, text: string) => {
    const seed = db.seeds.find((s) => s.id === id);
    if (!seed) return;
    upsertRows("seeds", [{ ...seed, text: text.trim() }]);
  }, [db.seeds, upsertRows]);

  const setSeedStatus = useCallback((id: string, status: SeedStatus) => {
    const seed = db.seeds.find((s) => s.id === id);
    if (!seed) return;
    upsertRows("seeds", [{
      ...seed,
      status,
      archivedAt: status === "archived" ? Date.now() : null,
    }]);
    emit("seed.status_changed", {
      payload: { seedId: id, from: seed.status, to: status, ageMs: Date.now() - seed.createdAt },
    });
  }, [db.seeds, upsertRows, emit]);

  const deleteSeed = useCallback((id: string) => {
    const seed = db.seeds.find((s) => s.id === id);
    removeRows("seeds", [id]);
    emit("seed.deleted", {
      payload: { seedId: id, ageMs: seed ? Date.now() - seed.createdAt : null, status: seed?.status ?? null },
    });
  }, [db.seeds, removeRows, emit]);

  const plantSeed = useCallback((seed: Seed, item: Item) => {
    upsertRows("items", [item]);
    upsertRows("seeds", [{ ...seed, itemId: item.id, archivedAt: Date.now(), status: "archived" }]);
    emit("seed.planted", {
      itemId: item.id,
      payload: { seedId: seed.id, kind: item.kind, restedMs: Date.now() - seed.createdAt },
    });
  }, [upsertRows, emit]);

  /** Undo for plantSeed: removes the item it created and brings the seed
   *  back to the inbox exactly as it was, for the "undo" on the moved
   *  notice shown right after organizing a seed. */
  const unplantSeed = useCallback((seedId: string, itemId: string) => {
    const seed = db.seeds.find((s) => s.id === seedId);
    if (seed) upsertRows("seeds", [{ ...seed, itemId: null, archivedAt: null, status: "inbox" }]);
    removeRows("items", [itemId]);
  }, [db.seeds, upsertRows, removeRows]);

  /* ————— daily journal ————— */
  const saveJournal = useCallback((date: string, patch: Partial<Omit<JournalEntry, "id" | "date" | "createdAt" | "updatedAt">>) => {
    const existing = db.journal.find((j) => j.date === date);
    const entry: JournalEntry = existing
      ? { ...existing, ...patch, updatedAt: Date.now() }
      : {
          id: uid(), date, roughNotes: "", endOfDay: "", mood: null, energy: null,
          createdAt: Date.now(), updatedAt: Date.now(),
          ...patch,
        };
    upsertRows("journal", [entry]);
    emit("journal.saved", {
      day: date,
      payload: {
        fields: Object.keys(patch),
        roughChars: entry.roughNotes.length,
        eodChars: entry.endOfDay.length,
        mood: entry.mood,
        energy: entry.energy,
      },
    });
  }, [db.journal, upsertRows, emit]);

  /* ————— labels ————— */
  const addLabel = useCallback((name: string, emoji: string, color: string): Label | null => {
    const label: Label = {
      id: uid(), name: name.trim(), emoji, color,
      position: db.labels.length, createdAt: Date.now(),
    };
    upsertRows("labels", [label]);
    return label;
  }, [db.labels.length, upsertRows]);

  const updateLabel = useCallback((id: string, patch: Partial<Label>) => {
    const label = db.labels.find((l) => l.id === id);
    if (label) upsertRows("labels", [{ ...label, ...patch }]);
  }, [db.labels, upsertRows]);

  const deleteLabel = useCallback((id: string) => {
    // content survives — items simply lose the tag
    const tagged = db.items
      .filter((i) => i.labels.includes(id))
      .map((i) => ({ ...i, labels: i.labels.filter((l) => l !== id) }));
    if (tagged.length) upsertRows("items", tagged);
    removeRows("labels", [id]);
  }, [db.items, db.labels, upsertRows, removeRows]);

  /* ————— areas ————— */
  const addArea = useCallback((name: string, emoji: string, color: string): Area | null => {
    const area: Area = {
      id: uid(), name: name.trim(), emoji, color,
      position: db.areas.length, createdAt: Date.now(),
    };
    upsertRows("areas", [area]);
    return area;
  }, [db.areas.length, upsertRows]);

  const updateArea = useCallback((id: string, patch: Partial<Area>) => {
    const area = db.areas.find((a) => a.id === id);
    if (!area) return;
    upsertRows("areas", [{ ...area, ...patch }]);
    // what an area is FOR, and how much of the person it was meant to get.
    // Same reason as settings.changed: an area score means something different
    // once the area says what it is for, and that sentence gets rewritten.
    for (const field of ["description", "whyItMatters", "targetShare"] as const) {
      if (!(field in patch)) continue;
      const before = area[field] ?? null;
      const after = patch[field] ?? null;
      if (before === after) continue;
      emit("area.context_changed", {
        payload: {
          areaId: id, areaName: area.name, field,
          to: clipValue(after),
          toChars: typeof after === "string" ? after.length : null,
          fromChars: typeof before === "string" ? before.length : null,
        },
      });
    }
  }, [db.areas, upsertRows, emit]);

  const deleteArea = useCallback((id: string) => {
    // items survive — they simply lose their room
    const orphans = db.items.filter((i) => i.areaId === id).map((i) => ({ ...i, areaId: null }));
    if (orphans.length) upsertRows("items", orphans);
    removeRows("areas", [id]);
  }, [db.items, upsertRows, removeRows]);

  /* ————— items ————— */
  const addItem = useCallback((
    partial: Partial<Item> & { title: string },
    opts: { origin?: string } = {}
  ): Item | null => {
    const item: Item = {
      id: uid(), areaId: null, parentId: null, kind: "note", tracker: "none",
      note: "", target: null, current: 0, unit: null, horizon: null, horizonPeriod: null,
      dateRepeatsYearly: false,
      richBody: null,
      status: "active", cadence: null, cadenceDays: null, cadenceCount: null,
      steps: null, entries: null, windowStart: null, windowEnd: null,
      pulledToday: false,
      labels: [], pinned: false,
      position: db.items.length, createdAt: Date.now(), completedAt: null, deletedAt: null,
      ...partial,
      title: partial.title.trim(),
    };
    // habits and routines live on their schedule — default to every day
    if ((item.kind === "habit" || item.kind === "routine") && !item.cadence) item.cadence = "daily";
    upsertRows("items", [item]);
    // the birth snapshot: "when did this enter my life, and as what" is only
    // answerable if the answer is recorded at the moment it happens
    emit("item.created", {
      itemId: item.id,
      payload: {
        kind: item.kind, tracker: item.tracker, horizon: item.horizon,
        horizonPeriod: item.horizonPeriod, areaId: item.areaId, parentId: item.parentId,
        target: item.target, unit: item.unit, cadence: item.cadence,
        cadenceDays: item.cadenceDays, cadenceCount: item.cadenceCount, labels: item.labels,
        titleLength: item.title.length,
        // the script it was born with, so a routine's history can be read
        // against the steps that existed on each day rather than today's
        stepIds: item.steps?.map((st) => st.id) ?? null,
        // invented, or taken off a shelf — "am I self-directing?" is not
        // answerable if borrowing looks exactly like authoring
        origin: opts.origin ?? "manual",
      },
    });
    return item;
  }, [db.items.length, upsertRows, emit]);

  const updateItem = useCallback((id: string, patch: Partial<Item>) => {
    const item = db.items.find((i) => i.id === id);
    if (!item) return;
    const next = { ...item, ...patch };
    upsertRows("items", [next]);
    // one diff here covers every path that edits an item — the item page, the
    // Life tree, the list screen, the pull-to-Today overlay
    for (const e of itemChangeEvents(item, next)) emit(e.type, e);
  }, [db.items, upsertRows, emit]);

  const deleteItem = useCallback((id: string) => {
    const item = db.items.find((i) => i.id === id);
    if (!item) return;
    // children move up a level instead of being destroyed
    const kids = db.items
      .filter((i) => i.parentId === id)
      .map((i) => ({ ...i, parentId: item.parentId, areaId: i.areaId ?? item.areaId }));
    if (kids.length) upsertRows("items", kids);
    // The item's actions and logs STAY. They used to be destroyed here, which
    // made "recoverable for 7 days" untrue of the part that mattered — restore
    // brought back an empty shell — and quietly deleted the whole progress
    // history of every abandoned project. They are hidden from the app the
    // same way the item is (see visibleDb) and destroyed only at purge.
    const actionCount = db.actions.filter((a) => a.itemId === id).length;
    const logCount = db.logs.filter((l) => l.itemId === id).length;
    upsertRows("items", [{ ...item, deletedAt: Date.now() }]);
    emit("item.trashed", {
      itemId: id,
      payload: {
        kind: item.kind, status: item.status,
        ageDays: Math.round((Date.now() - item.createdAt) / 86_400_000),
        childrenLifted: kids.length, actionsKept: actionCount, logsKept: logCount,
      },
    });
  }, [db, upsertRows, emit]);

  const trashedItems = useMemo(
    () => db.items.filter((i) => i.deletedAt).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0)),
    [db.items]
  );

  const restoreItem = useCallback((id: string) => {
    const item = db.items.find((i) => i.id === id);
    if (!item) return;
    upsertRows("items", [{ ...item, deletedAt: null }]);
    emit("item.restored", {
      itemId: id,
      payload: { kind: item.kind, trashedForMs: item.deletedAt ? Date.now() - item.deletedAt : null },
    });
  }, [db.items, upsertRows, emit]);

  /** Everything belonging to one item, destroyed together. Purge is the one
   *  place deletion is absolute: trash keeps the record so a restore is real,
   *  and this is where it stops being kept. */
  const purgeRowsOf = useCallback((id: string) => {
    const actionIds = db.actions.filter((a) => a.itemId === id).map((a) => a.id);
    if (actionIds.length) removeRows("actions", actionIds);
    const logIds = db.logs.filter((l) => l.itemId === id).map((l) => l.id);
    if (logIds.length) removeRows("logs", logIds);
    const noteIds = db.habitDayNotes.filter((n) => n.itemId === id).map((n) => n.id);
    if (noteIds.length) removeRows("habitDayNotes", noteIds);
    return { actionIds, logIds, noteIds };
  }, [db.actions, db.logs, db.habitDayNotes, removeRows]);

  const purgeItem = useCallback((id: string) => {
    const item = db.items.find((i) => i.id === id);
    const gone = purgeRowsOf(id);
    removeRows("items", [id]);
    emit("item.purged", {
      itemId: id,
      payload: {
        kind: item?.kind ?? null, title: item?.title ?? null,
        actionsPurged: gone.actionIds.length, logsPurged: gone.logIds.length,
      },
    });
  }, [db.items, purgeRowsOf, removeRows, emit]);

  // Trash empties itself after the retention window — no server cron needed,
  // this just sweeps whatever's overdue whenever the item list changes.
  useEffect(() => {
    const retentionDays = premium ? PREMIUM_TRASH_DAYS : FREE_LIMITS.trashDays;
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const expired = db.items.filter((i) => i.deletedAt && i.deletedAt < cutoff);
    if (expired.length) {
      // the rows kept for a possible restore go with the item they belong to
      for (const i of expired) purgeRowsOf(i.id);
      removeRows("items", expired.map((i) => i.id));
      for (const i of expired) {
        emit("item.purged", { itemId: i.id, payload: { kind: i.kind, title: i.title, by: "retention" } });
      }
    }
  }, [db.items, premium, purgeRowsOf, removeRows, emit]);

  /** Reorganize the life tree: change area and/or parent. Guards against cycles. */
  const moveItem = useCallback((id: string, dest: { areaId?: string | null; parentId?: string | null }) => {
    const item = db.items.find((i) => i.id === id);
    if (!item) return;
    let parentId = dest.parentId !== undefined ? dest.parentId : item.parentId;
    if (parentId === id) parentId = item.parentId; // cannot be its own parent
    if (parentId) {
      // walking up from the new parent must never reach the item itself
      let cur = db.items.find((i) => i.id === parentId) ?? null;
      const seen = new Set<string>();
      while (cur) {
        if (cur.id === id) { parentId = item.parentId; break; }
        if (!cur.parentId || seen.has(cur.parentId)) break;
        seen.add(cur.parentId);
        cur = db.items.find((i) => i.id === cur!.parentId) ?? null;
      }
    }
    const areaId = dest.areaId !== undefined
      ? dest.areaId
      : parentId
        ? db.items.find((i) => i.id === parentId)?.areaId ?? item.areaId
        : item.areaId;
    const next = { ...item, parentId, areaId };
    upsertRows("items", [next]);
    for (const e of itemChangeEvents(item, next)) emit(e.type, e);
  }, [db.items, upsertRows, emit]);

  /** Completing a thing nudges the meter of whatever it's nested inside:
   *  finish "part 1" and the 3-part book above it reads 1/3 without anyone
   *  touching it. Reaching the target completes the parent too, and the
   *  nudge keeps travelling — finish the last part, the book completes,
   *  and "read 6 books" ticks up one. Every move is written as a log, so
   *  history and Reflect see it like hand-entered progress. */
  const bumpParentMeter = useCallback((child: Item, delta: 1 | -1) => {
    const bump = (c: Item, d: 1 | -1, depth: number) => {
      if (depth > 12 || !c.parentId) return;
      const parent = db.items.find((i) => i.id === c.parentId);
      if (!parent || (parent.tracker !== "counter" && parent.tracker !== "book")) return;
      const next = Math.max(0, parent.current + d);
      if (next === parent.current) return;
      const reached =
        parent.status === "active" &&
        parent.target != null && next >= parent.target && parent.current < parent.target;
      upsertRows("items", [{
        ...parent,
        current: next,
        ...(reached ? { status: "done" as const, completedAt: Date.now() } : {}),
      }]);
      upsertRows("logs", [{
        id: uid(), itemId: parent.id, date: today(), op: "add", value: d, createdAt: Date.now(),
        source: "parent_cascade", via: `child:${c.id}`,
      }]);
      if (reached) bump(parent, 1, depth + 1);
    };
    bump(child, delta, 0);
  }, [db.items, upsertRows]);

  const completeItem = useCallback((id: string, opts?: LogOrigin) => {
    const item = db.items.find((i) => i.id === id);
    if (!item || item.status === "done") return;
    // a metered goal marked complete should read full, so its count agrees
    // with the 100% it now shows: fill its own tracker up to the max (book and
    // counter to target, money to target, percent to 100), only ever upward,
    // and log the delta so History and Reflect see the jump.
    // book/percent read exactly full when complete (also correcting any prior
    // overshoot); counter/money fill up to target but keep a deliberate one.
    const capped = item.tracker === "book" || item.tracker === "percent";
    const target = item.tracker === "percent" ? 100 : item.target;
    let filled: number | null = null;
    if (target != null) {
      if (capped) filled = item.current !== target ? target : null;
      else if (item.tracker === "counter" || item.tracker === "money") filled = item.current < target ? target : null;
    }
    upsertRows("items", [{
      ...item, status: "done", completedAt: Date.now(),
      ...(filled != null ? { current: filled } : {}),
    }]);
    if (filled != null) {
      const isCumulative = item.tracker === "counter" || item.tracker === "book";
      upsertRows("logs", [{
        id: uid(), itemId: item.id, date: today(),
        op: isCumulative ? "add" : "set",
        value: isCumulative ? filled - item.current : filled,
        createdAt: Date.now(),
        source: opts?.source ?? "manual", via: opts?.via ?? "complete_item",
      }]);
    }
    bumpParentMeter(item, 1);
    emit("item.completed", {
      itemId: item.id,
      payload: {
        kind: item.kind,
        tracker: item.tracker,
        // how long this took from the day it entered the system
        ageDays: Math.round((Date.now() - item.createdAt) / 86_400_000),
        // pieces still on the board when the whole thing was called done
        openActionsRemaining: db.actions.filter((a) => a.itemId === item.id && !a.done).length,
        openChildrenRemaining: db.items.filter(
          (k) => k.parentId === item.id && !k.deletedAt && k.status === "active"
        ).length,
        horizon: item.horizon,
        areaId: item.areaId,
      },
    });
  }, [db.items, db.actions, upsertRows, bumpParentMeter, emit]);

  const reopenItem = useCallback((id: string) => {
    const item = db.items.find((i) => i.id === id);
    if (!item || item.status === "active") return;
    upsertRows("items", [{ ...item, status: "active", completedAt: null }]);
    // takes back the nudge its completion gave (floored at zero, so meters
    // advanced by hand before this feature existed can't go negative)
    if (item.status === "done") bumpParentMeter(item, -1);
    emit("item.reopened", {
      itemId: item.id,
      payload: {
        kind: item.kind, fromStatus: item.status,
        doneForMs: item.completedAt ? Date.now() - item.completedAt : null,
      },
    });
  }, [db.items, upsertRows, bumpParentMeter, emit]);

  const setTracker = useCallback((item: Item, value: number, opts?: LogOrigin) => {
    // a book stops at its last chapter and a percent at 100; counters and
    // money may overshoot their target on purpose
    const cap = item.tracker === "book" ? item.target : item.tracker === "percent" ? 100 : null;
    const v = cap != null ? Math.min(cap, Math.max(0, value)) : Math.max(0, value);
    const reachedTarget = item.target != null && v >= item.target && item.current < item.target;
    upsertRows("items", [{
      ...item,
      current: v,
      ...(reachedTarget ? { status: "done" as const, completedAt: Date.now() } : {}),
    }]);
    if (reachedTarget) bumpParentMeter(item, 1);
    // counter/book are cumulative counts — Reflect's period movement only
    // sums "add" deltas for them, so a net change must log as one, not a
    // "set" snapshot (which would make it invisible to any period review).
    // money/percent are point-in-time values, so "set" is correct there.
    const isCumulative = item.tracker === "counter" || item.tracker === "book";
    upsertRows("logs", [{
      id: uid(), itemId: item.id, date: today(),
      op: isCumulative ? "add" : "set",
      value: isCumulative ? v - item.current : v,
      createdAt: Date.now(),
      source: opts?.source ?? "manual", via: opts?.via ?? "tracker_control",
    }]);
  }, [upsertRows, bumpParentMeter]);

  /* ————— actions / today ————— */
  const addAction = useCallback((
    title: string,
    date: string,
    itemId: string | null = null,
    amount = 1,
    opts: { priority?: number; note?: string; origin?: string } = {}
  ) => {
    const action: Action = {
      id: uid(), itemId, title: title.trim(), date, done: false, doneAt: null,
      amount, priority: opts.priority ?? 0, note: opts.note ?? "", createdAt: Date.now(),
    };
    upsertRows("actions", [action]);
    emit("action.created", {
      itemId,
      day: date,
      payload: {
        actionId: action.id, date, amount, priority: action.priority,
        hasNote: !!action.note.trim(), linked: !!itemId,
        // where it came from: a suggestion chip, a goal's "break off a piece",
        // or typed by hand into the day
        origin: opts.origin ?? "manual",
      },
    });
  }, [upsertRows, emit]);

  const updateAction = useCallback((id: string, patch: Partial<Action>) => {
    const action = db.actions.find((a) => a.id === id);
    if (!action) return;
    const next = { ...action, ...patch };
    upsertRows("actions", [next]);
    // every path that moves a task to another day arrives here, which is what
    // makes action.rescheduled a trustworthy procrastination signal
    for (const e of actionChangeEvents(action, next)) emit(e.type, { ...e, day: next.date });
  }, [db.actions, upsertRows, emit]);

  /** A planned task, given up on. Deleting one used to leave nothing at all,
   *  so a task abandoned and a task never written looked identical — and every
   *  completion rate silently counted only the tasks that survived. */
  const deleteAction = useCallback((id: string) => {
    const action = db.actions.find((a) => a.id === id);
    removeRows("actions", [id]);
    if (action) {
      emit("action.deleted", {
        itemId: action.itemId,
        day: action.date,
        payload: {
          actionId: id, title: action.title, plannedFor: action.date, done: action.done,
          ageDays: Math.round((Date.now() - action.createdAt) / 86_400_000),
          // deleted after the day it was meant for: given up on, not re-planned
          daysAfterPlanned: Math.round(
            (Date.now() - new Date(`${action.date}T12:00:00`).getTime()) / 86_400_000
          ),
        },
      });
    }
  }, [db.actions, removeRows, emit]);

  /** Add or take back exactly one occurrence of an item's day. One, not all:
   *  a habit with a target of three glasses must not lose the other two
   *  because a linked routine step was un-ticked. */
  const logOneOccurrence = useCallback((itemId: string, day: string, add: boolean, opts?: LogOrigin) => {
    if (add) {
      upsertRows("logs", [{
        id: uid(), itemId, date: day, op: "add", value: 1, createdAt: Date.now(),
        source: opts?.source ?? "manual", via: opts?.via ?? "",
      }]);
      return;
    }
    const mine = db.logs
      .filter((l) => l.itemId === itemId && l.date === day && l.op === "add")
      .sort((a, b) => b.createdAt - a.createdAt);
    if (mine.length) removeRows("logs", [mine[0].id]);
  }, [db.logs, upsertRows, removeRows]);

  /** Tick one step of a routine's script for a day.
   *
   *  `skipLinked` exists only to stop the two halves of a linked step calling
   *  each other in a circle: the reverse path (ticking the node's own row)
   *  has already written the node's log by the time it gets here. */
  const setRoutineStepDone = useCallback((
    item: Item, day: string, stepId: string, done: boolean, skipLinked = false
  ) => {
    const steps = item.steps ?? [];
    const stepIds = steps.map((s) => s.id);
    if (!stepIds.includes(stepId)) return;
    const existing = db.habitDayNotes.find((n) => n.itemId === item.id && n.date === day);
    const ticked = new Set(existing?.doneSteps ?? []);
    if (done) ticked.add(stepId);
    else ticked.delete(stepId);
    // keep script order and silently drop marks for steps since deleted
    const doneSteps = stepIds.filter((id) => ticked.has(id));
    // when each step was ticked, so the order and time of day a script was
    // actually walked survives — doneSteps alone is timeless
    const now = Date.now();
    const at: Record<string, number> = { ...(existing?.doneStepsAt ?? {}) };
    if (done) at[stepId] = now;
    else delete at[stepId];
    for (const key of Object.keys(at)) if (!ticked.has(key)) delete at[key];
    const doneStepsAt = Object.keys(at).length ? at : null;
    const row: HabitDayNote = existing
      ? { ...existing, doneSteps: doneSteps.length ? doneSteps : null, doneStepsAt, updatedAt: now }
      : {
          id: uid(), itemId: item.id, date: day, text: "", doneSteps, doneStepsAt,
          createdAt: now, updatedAt: now,
        };
    if (!row.text.trim() && !row.doneSteps?.length) {
      if (existing) removeRows("habitDayNotes", [existing.id]);
    } else {
      upsertRows("habitDayNotes", [row]);
    }
    // ticking the last REQUIRED step is doing the routine — log its day;
    // un-ticking one on a logged day takes the log back. Optional steps never
    // gate this, which is the whole point of marking them: the morning you
    // skip the stretch is still a morning you did your routine.
    const required = requiredSteps(item);
    const allDone = required.length > 0 && required.every((s) => ticked.has(s.id));
    const dayLogs = db.logs.filter((l) => l.itemId === item.id && l.date === day && l.op === "add");
    const logged = dayLogs.reduce((s, l) => s + l.value, 0) > 0;
    if (allDone && !logged) {
      upsertRows("logs", [{
        id: uid(), itemId: item.id, date: day, op: "add", value: 1, createdAt: Date.now(),
        source: "routine_run", via: "last_required_step",
      }]);
    } else if (!allDone && logged) {
      removeRows("logs", dayLogs.map((l) => l.id));
    }

    const stepIndex = stepIds.indexOf(stepId);
    emit(done ? "routine.step_done" : "routine.step_undone", {
      itemId: item.id,
      day,
      payload: {
        stepId,
        stepIndex,
        stepTitle: steps[stepIndex]?.title ?? null,
        optional: !!steps[stepIndex]?.optional,
        doneCount: doneSteps.length,
        stepCount: stepIds.length,
        completesDay: allDone && !logged,
      },
    });

    // a linked step and its row on the day are one act, so tick both. Only
    // ever one occurrence, and only when it would actually change something:
    // ticking a step of an already-full habit must not push it past its target.
    const step = steps.find((s) => s.id === stepId);
    const linked = !skipLinked && step?.itemId
      ? db.items.find((i) => i.id === step.itemId)
      : undefined;
    // Only a "day" link syncs on a tick. A metered target keeps its record in
    // its own count, which the runner lets you move on the step itself — the
    // tick adds nothing there, and inventing an amount for it would be a guess.
    if (linked) {
      const kind = linkKind(linked);
      if (kind === "day") {
        const value = dayLogged(db.logs, linked.id, day);
        const wanted = done ? value < habitDailyTarget(linked) : value > 0;
        if (wanted) logOneOccurrence(linked.id, day, done, { source: "routine_run", via: `step:${stepId}` });
      } else if (kind === "done") {
        // a one-off target: the step and the target are the same act, so
        // finishing one finishes the other. skipLinked stops the two halves
        // calling each other back.
        if (done) completeItem(linked.id, { source: "routine_run", via: `step:${stepId}` });
        else reopenItem(linked.id);
      }
      // "meter" writes nothing here: its count is the record, and the runner
      // puts that count on the step for you to move by hand
    }
  }, [db.habitDayNotes, db.logs, db.items, upsertRows, removeRows, logOneOccurrence, completeItem, reopenItem, emit]);

  /** Log or unlog one habit occurrence for a single day. This only ever
   *  touches the log history — it never changes the habit's own status,
   *  so "done today" can never accidentally retire the habit. */
  const toggleHabitDay = useCallback((
    item: Item, day: string, currentlyDone: boolean, skipLinked = false, opts?: LogOrigin
  ) => {
    if (currentlyDone) {
      const existing = db.logs.filter((l) => l.itemId === item.id && l.date === day && l.op === "add");
      if (existing.length) removeRows("logs", existing.map((l) => l.id));
    } else {
      upsertRows("logs", [{
        id: uid(), itemId: item.id, date: day, op: "add", value: 1, createdAt: Date.now(),
        source: opts?.source ?? "today_check", via: opts?.via ?? "day_checkbox",
      }]);
    }
    // a routine's round checkbox is shorthand for its whole script — the
    // day and its steps stay in agreement in both directions
    if (item.kind === "routine" && item.steps && item.steps.length > 0) {
      const note = db.habitDayNotes.find((n) => n.itemId === item.id && n.date === day);
      const doneSteps = currentlyDone ? null : item.steps.map((s) => s.id);
      if (note) {
        upsertRows("habitDayNotes", [{ ...note, doneSteps, updatedAt: Date.now() }]);
      } else if (doneSteps) {
        upsertRows("habitDayNotes", [{
          id: uid(), itemId: item.id, date: day, text: "", doneSteps,
          createdAt: Date.now(), updatedAt: Date.now(),
        }]);
      }
    }

    // the other direction: this node may be a step inside a routine, in which
    // case its script has to agree. Only routines whose own day is this day —
    // a night routine ticked at 1am belongs to last night, and today's tick
    // has no business reaching into it.
    if (!skipLinked) {
      if (linkKind(item) === "day") {
        for (const routine of db.items) {
          if (routine.kind !== "routine" || !routine.steps?.length) continue;
          if (routineLogDay(routine, new Date(), rolloverHour) !== day) continue;
          for (const step of routine.steps) {
            if (step.itemId === item.id) {
              setRoutineStepDone(routine, day, step.id, !currentlyDone, true);
            }
          }
        }
      }
    }
  }, [db.logs, db.habitDayNotes, db.items, upsertRows, removeRows, setRoutineStepDone, rolloverHour]);

  const toggleEntry = useCallback((entry: TodayEntry, forDay?: string, opts?: LogOrigin) => {
    const day = forDay ?? today();
    const origin: LogOrigin = { source: opts?.source ?? "today_check", via: opts?.via ?? "today_checkbox" };
    if (entry.virtualHabit && entry.item) {
      // the row itself knows which day it stands for — for a night routine
      // ticked at 1 am that's yesterday, not the page's calendar day
      toggleHabitDay(entry.item, entry.action.date, entry.action.done, false, origin);
      return;
    }
    if (entry.virtualItemTask && entry.item) {
      const nowDone = !entry.action.done;
      if (entry.action.done) reopenItem(entry.item.id);
      else completeItem(entry.item.id, origin);
      // and any routine step standing for this same target agrees
      for (const routine of db.items) {
        if (routine.kind !== "routine" || !routine.steps?.length) continue;
        const rDay = routineLogDay(routine, new Date(), rolloverHour);
        for (const step of routine.steps) {
          if (step.itemId === entry.item.id) {
            setRoutineStepDone(routine, rDay, step.id, nowDone, true);
          }
        }
      }
      return;
    }
    const a = entry.action;
    const nowDone = !a.done;
    upsertRows("actions", [{ ...a, done: nowDone, doneAt: nowDone ? Date.now() : null }]);
    emit(nowDone ? "action.done" : "action.undone", {
      itemId: a.itemId,
      day,
      payload: {
        actionId: a.id, title: a.title, plannedFor: a.date,
        // a task ticked on a later day than it was planned for: the gap is
        // the interesting number, and it is only visible right here
        daysLate: nowDone ? Math.round((new Date(`${day}T12:00:00`).getTime() - new Date(`${a.date}T12:00:00`).getTime()) / 86_400_000) : null,
        carriedFrom: entry.carriedFrom,
        via: origin.via,
      },
    });
    // progress flows upward: completing a linked action advances its item.
    // amount 0 is a real choice — a directional step ("clone the repo")
    // that belongs to the goal without pretending to move its meter
    if (a.itemId) {
      const item = db.items.find((i) => i.id === a.itemId);
      if (item && (item.tracker === "counter" || item.tracker === "book") && a.amount > 0) {
        const delta = nowDone ? a.amount : -a.amount;
        const next = Math.max(0, item.current + delta);
        const reachedTarget = item.target != null && next >= item.target && item.current < item.target;
        upsertRows("items", [{
          ...item,
          current: next,
          ...(reachedTarget ? { status: "done" as const, completedAt: Date.now() } : {}),
        }]);
        upsertRows("logs", [{
          id: uid(), itemId: item.id, date: day, op: "add", value: delta, createdAt: Date.now(),
          source: origin.source, via: origin.via,
        }]);
        if (reachedTarget) bumpParentMeter(item, 1);
      } else if (item && item.tracker === "check") {
        // a leaf item whose only open piece this was: checking the piece IS
        // checking the thing — completing it here must show up completed in
        // the Life tree too, without a second manual visit. Items with
        // children or with other open pieces still complete deliberately.
        const hasKids = db.items.some(
          (k) => k.parentId === item.id && !k.deletedAt && k.status !== "archived"
        );
        const otherOpen = db.actions.some((x) => x.itemId === item.id && x.id !== a.id && !x.done);
        if (!hasKids && !otherOpen) {
          if (nowDone && item.status === "active") completeItem(item.id, origin);
          else if (!nowDone && item.status === "done") reopenItem(item.id);
        }
      }
    }
  }, [db.items, db.actions, upsertRows, removeRows, toggleHabitDay, completeItem, reopenItem, bumpParentMeter, setRoutineStepDone, emit, rolloverHour]);

  const reorderDay = useCallback((day: string, orderedEntryIds: string[], via: "drag" | "sort" = "drag") => {
    const existing = db.dayOrder.find((d) => d.date === day);
    upsertRows("dayOrder", [
      existing
        ? { ...existing, order: orderedEntryIds, updatedAt: Date.now() }
        : { id: uid(), date: day, order: orderedEntryIds, updatedAt: Date.now() },
    ]);
    // a deliberate drag and the "Sort" tidy-up are different acts and must
    // not read the same afterwards
    emit("day.reordered", { day, payload: { via, entryCount: orderedEntryIds.length } });
  }, [db.dayOrder, upsertRows, emit]);

  /* ————— reflections ————— */
  const saveReflection = useCallback((
    period: Reflection["period"],
    periodKey: string,
    patch: Partial<Omit<Reflection, "id" | "period" | "periodKey" | "createdAt" | "updatedAt">>
  ) => {
    const existing = db.reflections.find((r) => r.period === period && r.periodKey === periodKey);
    const next: Reflection = existing
      ? { ...existing, ...patch, updatedAt: Date.now() }
      : {
          id: uid(), period, periodKey, text: "",
          createdAt: Date.now(), updatedAt: Date.now(),
          ...patch,
        };
    upsertRows("reflections", [next]);
    emit("reflection.saved", {
      payload: {
        period, periodKey, fields: Object.keys(patch),
        textChars: next.text.length,
        intentionCount: next.intentions?.length ?? 0,
        winCount: next.wins?.length ?? 0,
      },
    });
  }, [db.reflections, upsertRows, emit]);

  /* ————— habit day notes ————— */
  const setHabitDayNote = useCallback((itemId: string, date: string, text: string) => {
    const existing = db.habitDayNotes.find((n) => n.itemId === itemId && n.date === date);
    const trimmed = text.trim();
    if (!trimmed) {
      // the row may still be holding a routine's step ticks for the day —
      // only a row carrying nothing at all actually goes away
      if (existing?.doneSteps?.length) {
        upsertRows("habitDayNotes", [{ ...existing, text: "", updatedAt: Date.now() }]);
      } else if (existing) {
        removeRows("habitDayNotes", [existing.id]);
      }
      return;
    }
    if (existing) {
      upsertRows("habitDayNotes", [{ ...existing, text: trimmed, updatedAt: Date.now() }]);
    } else {
      upsertRows("habitDayNotes", [{
        id: uid(), itemId, date, text: trimmed, doneSteps: null,
        createdAt: Date.now(), updatedAt: Date.now(),
      }]);
    }
  }, [db.habitDayNotes, upsertRows, removeRows]);

  /* ————— auth —————
   * Exporting lives in lib/export/, not here: the bundle is built from the
   * stored rows and the streams, which this provider is only one source of. */
  const signOut = useCallback(async () => {
    try {
      await api("/v1/auth/logout", { method: "POST" });
    } catch {
      // signing out locally regardless
    }
    clearToken();
    window.location.href = "/";
  }, []);

  const dismissSyncError = useCallback(() => setSyncError(null), []);

  const value: LifeContextValue = {
    ready, db: visibleDb, mode, cloudAvailable, user, premium, owner, limits,
    syncError, dismissSyncError,
    theme, setTheme,
    font, setFont,
    simple, setSimple,
    restSeconds, setRestSeconds,
    settings, updateSettings,
    emit, recordSession, flushStreams,
    refresh, syncing, holdSync,
    addSeed, updateSeed, setSeedStatus, deleteSeed, plantSeed, unplantSeed,
    saveJournal,
    addLabel, updateLabel, deleteLabel,
    addArea, updateArea, deleteArea,
    addItem, updateItem, moveItem, deleteItem, trashedItems, restoreItem, purgeItem,
    completeItem, reopenItem, setTracker,
    addAction, updateAction, deleteAction, toggleEntry, toggleHabitDay, setRoutineStepDone, reorderDay,
    saveReflection,
    setHabitDayNote,
    signOut,
  };

  return <LifeContext.Provider value={value}>{children}</LifeContext.Provider>;
}
