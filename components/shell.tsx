"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import { useLife } from "@/lib/data/provider";

const TABS = [
  { href: "/home", label: "Mind", icon: MindIcon },
  { href: "/today", label: "Today", icon: SunIcon },
  { href: "/life", label: "Life", icon: LifeIcon },
  { href: "/reflect", label: "Reflect", icon: MirrorIcon },
  { href: "/you", label: "You", icon: YouIcon },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { ready, syncError, dismissSyncError } = useLife();

  return (
    <div className="relative z-[1] min-h-dvh lg:flex">
      {syncError && (
        <div className="fixed top-[max(0.75rem,env(safe-area-inset-top))] left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2">
          <div className="fade-in flex items-start gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-ink-2 shadow-(--shadow-float)">
            <span className="flex-1 leading-snug">{syncError}</span>
            <button onClick={dismissSyncError} aria-label="Dismiss" className="text-ink-3 hover:text-ink">×</button>
          </div>
        </div>
      )}

      {/* desktop: quiet left rail */}
      <aside className="no-print hidden lg:flex sticky top-0 h-dvh w-56 shrink-0 flex-col border-r border-line-soft px-4 py-8">
        <Link href="/home" className="flex items-center gap-2.5 px-3">
          <span
            className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-white"
            style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-deep))" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20c-4-1-7-5-6-11 6-1 10 2 11 6 1 4-1 5-5 5Z" />
              <path d="M6 9c3 3 5 7 6 11" />
            </svg>
          </span>
          <span className="font-display text-xl text-ink">LoopUpward</span>
        </Link>
        <nav className="mt-8 flex flex-col gap-1">
          {TABS.map((tab) => {
            const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`pressable flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  active ? "bg-surface text-accent-deep shadow-(--shadow-card)" : "text-ink-2 hover:bg-surface-2"
                }`}
              >
                <Icon active={active} />
                {tab.label}
              </Link>
            );
          })}
        </nav>
        <Link
          href="/guide"
          className="mt-auto px-3 text-xs text-ink-3 hover:text-ink-2"
        >
          How it works →
        </Link>
      </aside>

      <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col lg:mx-0 lg:min-h-0 lg:max-w-none lg:flex-1">
        <main className="flex-1 px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-28 lg:px-10 lg:pb-12 lg:pt-8">
          {ready ? children : <ShellSkeleton />}
        </main>
      </div>

      {/* mobile: bottom tab bar */}
      <nav className="no-print fixed bottom-0 left-1/2 z-40 w-full max-w-lg -translate-x-1/2 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
        <div className="flex items-center justify-around rounded-3xl border border-line-soft bg-surface/90 px-2 py-2 shadow-(--shadow-float) backdrop-blur-xl">
          {TABS.map((tab) => {
            const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`pressable flex flex-col items-center gap-0.5 rounded-2xl px-3 py-1.5 text-[0.68rem] font-medium transition-colors ${
                  active ? "text-accent-deep" : "text-ink-3 hover:text-ink-2"
                }`}
              >
                <Icon active={active} />
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function ShellSkeleton() {
  return (
    <div className="animate-pulse space-y-4 pt-8">
      <div className="h-8 w-2/3 rounded-lg bg-surface-2" />
      <div className="h-24 rounded-(--radius-card) bg-surface-2" />
      <div className="h-24 rounded-(--radius-card) bg-surface-2" />
    </div>
  );
}

/* Hand-drawn-adjacent line icons, 22px, stroke inherits currentColor */

function base(active?: boolean) {
  return {
    width: 22, height: 22, viewBox: "0 0 24 24", fill: "none",
    stroke: "currentColor", strokeWidth: active ? 2.2 : 1.8,
    strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  };
}

function MindIcon({ active }: { active?: boolean }) {
  return (
    <svg {...base(active)}>
      <path d="M12 4c-4 0-7 2.8-7 6.5 0 2.2 1.1 4 2.8 5.2L7 20l3.5-1.6c.5.1 1 .1 1.5.1 4 0 7-2.8 7-6.5S16 4 12 4Z" />
      <path d="M9.5 10.5h5M9.5 13h3" opacity={active ? 1 : 0.6} />
    </svg>
  );
}

function SunIcon({ active }: { active?: boolean }) {
  return (
    <svg {...base(active)}>
      <circle cx="12" cy="12" r="4" fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.18 : 0} />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
    </svg>
  );
}

function LifeIcon({ active }: { active?: boolean }) {
  return (
    <svg {...base(active)}>
      <path d="M12 21V9" />
      <path d="M12 13c0-3.5 2.5-6 6-6 0 3.5-2.5 6-6 6Z" fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.18 : 0} />
      <path d="M12 10C12 6.5 9.5 4 6 4c0 3.5 2.5 6 6 6Z" fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.18 : 0} />
      <path d="M7 21h10" />
    </svg>
  );
}

function MirrorIcon({ active }: { active?: boolean }) {
  return (
    <svg {...base(active)}>
      <ellipse cx="12" cy="10" rx="6" ry="7" fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.14 : 0} />
      <path d="M12 17v4M9 21h6" />
      <path d="M9.5 7.5c.8-1 2-1.6 3-1.6" opacity={0.7} />
    </svg>
  );
}

function YouIcon({ active }: { active?: boolean }) {
  return (
    <svg {...base(active)}>
      <circle cx="12" cy="8.5" r="3.5" fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.18 : 0} />
      <path d="M5 20c1-3.5 3.8-5 7-5s6 1.5 7 5" />
    </svg>
  );
}
