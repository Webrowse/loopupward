"use client";

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import {
  api, ApiRequestError, apiConfigured, ApiUser, clearToken, getToken,
} from "../api";
import { Action, Area, DB, EMPTY_DB, Item, Reflection, Seed, TableName } from "../types";
import { CloudRepo } from "./cloud";
import { LocalRepo, clearLocalDB, localHasData, readLocalDB } from "./local";
import { Repo } from "./repo";
import { uid } from "../uid";
import { today } from "../dates";
import { TodayEntry } from "../progress";
import { FREE_LIMITS } from "../limits";

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

  addSeed: (text: string) => Seed;
  archiveSeed: (id: string) => void;
  plantSeed: (seed: Seed, item: Item) => void;

  addArea: (name: string, emoji: string, color: string) => Area | null;
  updateArea: (id: string, patch: Partial<Area>) => void;
  deleteArea: (id: string) => void;

  addItem: (partial: Partial<Item> & { title: string }) => Item | null;
  updateItem: (id: string, patch: Partial<Item>) => void;
  deleteItem: (id: string) => void;
  completeItem: (id: string) => void;
  reopenItem: (id: string) => void;
  bumpTracker: (item: Item, delta: number) => void;
  setTracker: (item: Item, value: number) => void;

  addAction: (title: string, date: string, itemId?: string | null, amount?: number) => void;
  deleteAction: (id: string) => void;
  toggleEntry: (entry: TodayEntry) => void;

  saveReflection: (period: Reflection["period"], periodKey: string, text: string) => void;

  signOut: () => Promise<void>;
  exportJSON: () => string;
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
  const repoRef = useRef<Repo>(new LocalRepo());
  const cloudAvailable = apiConfigured();
  const mode: "local" | "cloud" = user ? "cloud" : "local";

  /* ————— theme ————— */
  useEffect(() => {
    setThemeState(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }, []);
  const setTheme = useCallback((t: "light" | "dark") => {
    setThemeState(t);
    document.documentElement.dataset.theme = t === "dark" ? "dark" : "";
    try { localStorage.setItem("lifeos-theme", t); } catch {}
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
            // first sign-in: carry the on-device life into the cloud
            const local = readLocalDB();
            await cloud.importAll(local);
            data = await cloud.load();
            clearLocalDB();
          }
          if (!cancelled) {
            repoRef.current = cloud;
            setUser(me);
            setDb(data);
            setReady(true);
          }
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
  }, []);

  /* ————— persistence helpers ————— */
  const persist = useCallback((fn: (repo: Repo) => Promise<void>) => {
    fn(repoRef.current).catch((e) => {
      console.error("[lifeos] sync failed", e);
      if (e instanceof ApiRequestError && e.code === "limit") {
        setSyncError(e.message);
      } else {
        setSyncError("A change couldn't be saved to the cloud. It's still on this device — refresh to retry.");
      }
    });
  }, []);

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
    const activeItems = db.items.filter((i) => i.status === "active").length;
    return {
      canAddArea: premium || db.areas.length < FREE_LIMITS.areas,
      canAddItem: premium || activeItems < FREE_LIMITS.activeItems,
    };
  }, [db, premium]);

  /* ————— seeds ————— */
  const addSeed = useCallback((text: string): Seed => {
    const seed: Seed = { id: uid(), text: text.trim(), createdAt: Date.now(), itemId: null, archivedAt: null };
    upsertRows("seeds", [seed]);
    return seed;
  }, [upsertRows]);

  const archiveSeed = useCallback((id: string) => {
    const seed = db.seeds.find((s) => s.id === id);
    if (seed) upsertRows("seeds", [{ ...seed, archivedAt: Date.now() }]);
  }, [db.seeds, upsertRows]);

  const plantSeed = useCallback((seed: Seed, item: Item) => {
    upsertRows("items", [item]);
    upsertRows("seeds", [{ ...seed, itemId: item.id, archivedAt: Date.now() }]);
  }, [upsertRows]);

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
    if (area) upsertRows("areas", [{ ...area, ...patch }]);
  }, [db.areas, upsertRows]);

  const deleteArea = useCallback((id: string) => {
    // items survive — they simply lose their room
    const orphans = db.items.filter((i) => i.areaId === id).map((i) => ({ ...i, areaId: null }));
    if (orphans.length) upsertRows("items", orphans);
    removeRows("areas", [id]);
  }, [db.items, upsertRows, removeRows]);

  /* ————— items ————— */
  const addItem = useCallback((partial: Partial<Item> & { title: string }): Item | null => {
    const item: Item = {
      id: uid(), areaId: null, parentId: null, kind: "note", tracker: "none",
      note: "", target: null, current: 0, unit: null, horizon: null,
      status: "active", cadence: null, pinned: false,
      position: db.items.length, createdAt: Date.now(), completedAt: null,
      ...partial,
      title: partial.title.trim(),
    };
    if (item.kind === "habit" && !item.cadence) item.cadence = "daily";
    upsertRows("items", [item]);
    return item;
  }, [db.items.length, upsertRows]);

  const updateItem = useCallback((id: string, patch: Partial<Item>) => {
    const item = db.items.find((i) => i.id === id);
    if (item) upsertRows("items", [{ ...item, ...patch }]);
  }, [db.items, upsertRows]);

  const deleteItem = useCallback((id: string) => {
    const item = db.items.find((i) => i.id === id);
    if (!item) return;
    // children move up a level instead of being destroyed
    const kids = db.items
      .filter((i) => i.parentId === id)
      .map((i) => ({ ...i, parentId: item.parentId, areaId: i.areaId ?? item.areaId }));
    if (kids.length) upsertRows("items", kids);
    const actionIds = db.actions.filter((a) => a.itemId === id).map((a) => a.id);
    if (actionIds.length) removeRows("actions", actionIds);
    const logIds = db.logs.filter((l) => l.itemId === id).map((l) => l.id);
    if (logIds.length) removeRows("logs", logIds);
    removeRows("items", [id]);
  }, [db, upsertRows, removeRows]);

  const completeItem = useCallback((id: string) => {
    const item = db.items.find((i) => i.id === id);
    if (item) upsertRows("items", [{ ...item, status: "done", completedAt: Date.now() }]);
  }, [db.items, upsertRows]);

  const reopenItem = useCallback((id: string) => {
    const item = db.items.find((i) => i.id === id);
    if (item) upsertRows("items", [{ ...item, status: "active", completedAt: null }]);
  }, [db.items, upsertRows]);

  const bumpTracker = useCallback((item: Item, delta: number) => {
    const next = Math.max(0, item.current + delta);
    const reachedTarget = item.target != null && next >= item.target && item.current < item.target;
    upsertRows("items", [{
      ...item,
      current: next,
      ...(reachedTarget ? { status: "done" as const, completedAt: Date.now() } : {}),
    }]);
    // progress history: every bump is an event, never just a mutated counter
    upsertRows("logs", [{
      id: uid(), itemId: item.id, date: today(), op: "add", value: delta, createdAt: Date.now(),
    }]);
  }, [upsertRows]);

  const setTracker = useCallback((item: Item, value: number) => {
    const v = Math.max(0, value);
    upsertRows("items", [{ ...item, current: v }]);
    upsertRows("logs", [{
      id: uid(), itemId: item.id, date: today(), op: "set", value: v, createdAt: Date.now(),
    }]);
  }, [upsertRows]);

  /* ————— actions / today ————— */
  const addAction = useCallback((title: string, date: string, itemId: string | null = null, amount = 1) => {
    const action: Action = {
      id: uid(), itemId, title: title.trim(), date, done: false, doneAt: null,
      amount, createdAt: Date.now(),
    };
    upsertRows("actions", [action]);
  }, [upsertRows]);

  const deleteAction = useCallback((id: string) => removeRows("actions", [id]), [removeRows]);

  const toggleEntry = useCallback((entry: TodayEntry) => {
    const day = today();
    if (entry.virtualHabit && entry.item) {
      // habit: toggle today's log
      const existing = db.logs.filter((l) => l.itemId === entry.item!.id && l.date === day);
      if (entry.action.done) {
        if (existing.length) removeRows("logs", existing.map((l) => l.id));
      } else if (!existing.length) {
        upsertRows("logs", [{
          id: uid(), itemId: entry.item.id, date: day, op: "add", value: 1, createdAt: Date.now(),
        }]);
      }
      return;
    }
    const a = entry.action;
    const nowDone = !a.done;
    upsertRows("actions", [{ ...a, done: nowDone, doneAt: nowDone ? Date.now() : null }]);
    // progress flows upward: completing a linked action advances its item
    if (a.itemId) {
      const item = db.items.find((i) => i.id === a.itemId);
      if (item && (item.tracker === "counter" || item.tracker === "book")) {
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
        }]);
      }
      // check-tracked items are completed deliberately from their own page,
      // never as a side effect of finishing one small piece
    }
  }, [db.logs, db.items, upsertRows, removeRows]);

  /* ————— reflections ————— */
  const saveReflection = useCallback((period: Reflection["period"], periodKey: string, text: string) => {
    const existing = db.reflections.find((r) => r.period === period && r.periodKey === periodKey);
    if (existing) {
      upsertRows("reflections", [{ ...existing, text, updatedAt: Date.now() }]);
    } else {
      upsertRows("reflections", [{
        id: uid(), period, periodKey, text, createdAt: Date.now(), updatedAt: Date.now(),
      }]);
    }
  }, [db.reflections, upsertRows]);

  /* ————— auth & export ————— */
  const signOut = useCallback(async () => {
    try {
      await api("/v1/auth/logout", { method: "POST" });
    } catch {
      // signing out locally regardless
    }
    clearToken();
    window.location.href = "/";
  }, []);

  const exportJSON = useCallback(() => {
    return JSON.stringify(
      { app: "LoopUpward", exportedAt: new Date().toISOString(), data: db },
      null,
      2
    );
  }, [db]);

  const dismissSyncError = useCallback(() => setSyncError(null), []);

  const value: LifeContextValue = {
    ready, db, mode, cloudAvailable, user, premium, owner, limits,
    syncError, dismissSyncError,
    theme, setTheme,
    addSeed, archiveSeed, plantSeed,
    addArea, updateArea, deleteArea,
    addItem, updateItem, deleteItem, completeItem, reopenItem, bumpTracker, setTracker,
    addAction, deleteAction, toggleEntry,
    saveReflection,
    signOut, exportJSON,
  };

  return <LifeContext.Provider value={value}>{children}</LifeContext.Provider>;
}
