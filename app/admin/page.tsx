"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiRequestError, apiConfigured, getToken } from "@/lib/api";
import { GRANT_OPTIONS, isPremium } from "@/lib/limits";

interface Stats {
  users: number; premium: number; items: number; seeds: number;
  completedActions: number; activeSubscriptions: number;
}
interface AdminUser {
  id: string; email: string; name: string | null;
  /** subscription-owned end (Razorpay writes this) */
  premiumUntil: string | null;
  /** admin-owned end (owner grants write this) — access is the later of the two */
  adminPremiumUntil: string | null;
  plan: string | null; role: string; createdAt: string;
}

/** The later of the two premium clocks — mirrors the server's access rule. */
function effectiveUntil(u: AdminUser): string | null {
  const times = [u.premiumUntil, u.adminPremiumUntil].filter((t): t is string => !!t);
  if (times.length === 0) return null;
  return times.sort()[times.length - 1];
}

export default function AdminPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = useCallback(async (query: string) => {
    try {
      const data = await api<{ users: AdminUser[] }>(
        `/v1/admin/users?q=${encodeURIComponent(query)}`
      );
      setUsers(data.users);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    }
  }, []);

  useEffect(() => {
    if (!apiConfigured() || !getToken()) {
      setAllowed(false);
      return;
    }
    api<Stats>("/v1/admin/stats")
      .then((s) => {
        setAllowed(true);
        setStats(s);
        loadUsers("");
      })
      .catch((e) => {
        setAllowed(false);
        if (!(e instanceof ApiRequestError && (e.status === 403 || e.status === 401))) {
          setError(e instanceof Error ? e.message : "failed");
        }
      });
  }, [loadUsers]);

  const grant = async (userId: string, days?: number, revoke = false) => {
    setBusy(userId);
    setError(null);
    try {
      const data = await api<{ adminPremiumUntil: string | null }>("/v1/admin/grant", {
        method: "POST",
        body: { userId, days, revoke },
      });
      // only the grant clock moves — a paid subscription (premiumUntil/plan)
      // is untouched by both granting and revoking
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId ? { ...u, adminPremiumUntil: data.adminPremiumUntil } : u
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(null);
    }
  };

  if (allowed === null) {
    return <p className="pt-20 text-center text-sm text-ink-3">Checking access…</p>;
  }
  if (!allowed) {
    return (
      <div className="mx-auto max-w-lg px-6 pt-20 text-center">
        <h1 className="font-display text-2xl text-ink">Admin</h1>
        <p className="mt-3 text-sm text-ink-2 leading-relaxed">
          This area belongs to the app owner.{" "}
          <Link href="/home" className="text-accent-deep font-medium">Back to your space →</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="relative z-[1] mx-auto min-h-dvh w-full max-w-3xl px-6 pt-10 pb-20">
      <div className="flex items-baseline justify-between">
        <h1 className="font-display text-2xl text-ink">Owner panel</h1>
        <Link href="/you" className="text-sm text-ink-3 hover:text-ink-2">← back to app</Link>
      </div>

      {/* stats */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats ? (
          <>
            <Stat label="Users" value={stats.users} />
            <Stat label="Premium" value={stats.premium} />
            <Stat label="Active subs" value={stats.activeSubscriptions} />
            <Stat label="Items planted" value={stats.items} />
            <Stat label="Seeds captured" value={stats.seeds} />
            <Stat label="Actions done" value={stats.completedActions} />
          </>
        ) : (
          <p className="col-span-3 text-sm text-ink-3">Loading stats…</p>
        )}
      </div>

      {/* user search */}
      <div className="mt-10">
        <div className="flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadUsers(q)}
            placeholder="Search by email or name…"
            className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-3 outline-none focus:border-accent"
          />
          <button
            onClick={() => loadUsers(q)}
            className="pressable rounded-xl bg-ink px-4 text-sm font-medium text-bg"
          >
            Search
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}

        <div className="mt-4 space-y-2">
          {users.map((u) => {
            const until = effectiveUntil(u);
            const premium = isPremium(until);
            const granted = isPremium(u.adminPremiumUntil);
            return (
              <div key={u.id} className="rounded-(--radius-card) border border-line-soft bg-surface p-4 shadow-(--shadow-card)">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink truncate">
                      {u.name ?? "—"} {u.role === "owner" && <span className="text-amber">★ owner</span>}
                    </p>
                    <p className="text-xs text-ink-3 truncate">{u.email}</p>
                  </div>
                  <div className="text-right text-xs">
                    {premium ? (
                      <span className="rounded-full bg-accent-soft px-2.5 py-1 font-medium text-accent-deep">
                        premium{u.plan ? ` · ${u.plan}` : ""}{granted ? " · grant" : ""}
                        {until && new Date(until).getFullYear() < 2100 &&
                          ` → ${new Date(until).toLocaleDateString()}`}
                      </span>
                    ) : (
                      <span className="rounded-full bg-surface-2 px-2.5 py-1 text-ink-3">free</span>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {GRANT_OPTIONS.map((g) => (
                    <button
                      key={g.days}
                      disabled={busy === u.id}
                      onClick={() => grant(u.id, g.days)}
                      className="pressable rounded-full border border-line px-2.5 py-1 text-xs text-ink-2 hover:border-accent hover:text-accent-deep disabled:opacity-40"
                    >
                      +{g.label}
                    </button>
                  ))}
                  {/* removes only the granted time — paid subscription time
                      can't be revoked from here, it simply runs out */}
                  {granted && (
                    <button
                      disabled={busy === u.id}
                      onClick={() => grant(u.id, undefined, true)}
                      className="pressable rounded-full border border-line px-2.5 py-1 text-xs text-danger disabled:opacity-40"
                    >
                      Remove grant
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {users.length === 0 && <p className="text-sm text-ink-3">No users found.</p>}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-(--radius-card) border border-line-soft bg-surface p-4 shadow-(--shadow-card)">
      <div className="text-xs font-medium uppercase tracking-wide text-ink-3">{label}</div>
      <div className="font-display text-2xl text-ink mt-1 tabular-nums">{value.toLocaleString()}</div>
    </div>
  );
}
