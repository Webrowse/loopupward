"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { useLife } from "@/lib/data/provider";
import { api } from "@/lib/api";
import { Button, Card, Segmented } from "@/components/ui";
import { FONT_OPTIONS, FontId } from "@/lib/fonts";

const FONT_VARS: Record<FontId, string> = {
  fraunces: "var(--font-fraunces)",
  lora: "var(--font-lora)",
  playfair: "var(--font-playfair)",
  crimson: "var(--font-crimson)",
  "source-serif": "var(--font-source-serif)",
};

export default function YouPage() {
  const {
    db, user, premium, owner, mode, cloudAvailable,
    theme, setTheme, font, setFont, simple, setSimple, signOut, exportJSON, trashedItems,
  } = useLife();
  const [exporting, setExporting] = useState(false);

  const download = async () => {
    setExporting(true);
    try {
      const payload =
        mode === "cloud" ? JSON.stringify(await api("/v1/export"), null, 2) : exportJSON();
      const blob = new Blob([payload], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `loopupward-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const lifetime =
    user?.premiumUntil && new Date(user.premiumUntil).getFullYear() > new Date().getFullYear() + 50;

  return (
    <div className="rise-in lg:max-w-2xl">
      <header className="pt-6 pb-6">
        <p className="text-sm text-ink-3">Your account, plan &amp; preferences</p>
        <h1 className="font-display text-[2rem] leading-tight text-ink mt-1">Settings</h1>
      </header>

      {/* account */}
      <Card className="p-5 mb-3">
        {user ? (
          <div className="flex items-center gap-4">
            {user.avatarUrl ? (
              <Image src={user.avatarUrl} alt="" width={48} height={48} className="rounded-full" unoptimized />
            ) : (
              <div className="grid h-12 w-12 place-items-center rounded-full bg-accent-soft font-display text-lg text-accent-deep">
                {(user.name ?? user.email).slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-medium text-ink truncate">{user.name ?? "You"}</p>
              <p className="text-sm text-ink-3 truncate">{user.email}</p>
            </div>
          </div>
        ) : (
          <div>
            <p className="font-medium text-ink">Your data lives on this device</p>
            <p className="text-sm text-ink-2 mt-1 leading-relaxed">
              {cloudAvailable
                ? "Sign in with Google to keep it safe in your private cloud and continue on any device: phone or laptop, same life."
                : "Cloud sync isn't configured for this deployment yet. Everything is stored locally in your browser."}
            </p>
            {cloudAvailable && (
              <div className="mt-4">
                <Link href="/login"><Button small>Sign in with Google</Button></Link>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* plan */}
      <Card className="p-5 mb-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-3">Plan</p>
            <p className="font-display text-lg text-ink mt-0.5">
              {premium ? (lifetime ? "Premium · lifetime" : "Premium") : "Free"}
            </p>
            {premium && user?.premiumUntil && !lifetime && (
              <p className="text-xs text-ink-3">
                until {new Date(user.premiumUntil).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
              </p>
            )}
          </div>
          {!premium && (
            <Link href="/pricing"><Button small>Upgrade</Button></Link>
          )}
        </div>
        {!premium && (
          <p className="text-sm text-ink-2 mt-3 leading-relaxed">
            Premium unlocks unlimited life areas, quarterly &amp; yearly reviews, and your
            complete history, for people serious about becoming someone.
          </p>
        )}
      </Card>

      {/* how much of the machinery shows */}
      <Card className="p-5 mb-3">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm font-medium text-ink">How the app feels</p>
          <Segmented
            options={[{ value: "simple", label: "Simple" }, { value: "full", label: "Full" }]}
            value={simple ? "simple" : "full"}
            onChange={(v) => setSimple(v === "simple")}
          />
        </div>
        <p className="text-sm text-ink-2 mt-2 leading-relaxed">
          {simple
            ? "Simple keeps it to to-dos, notes and your day: adding something asks only for a name, when, and where it belongs. Every advanced tool (types, progress meters, labels, reviews) is still here — one tap under “More options”, and switching back to Full any time."
            : "Full shows everything: goal types, progress meters, labels and reviews. Prefer just to-dos and notes? Simple hides the machinery without deleting anything."}
        </p>
      </Card>

      {/* appearance */}
      <Card className="p-5 mb-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-ink">Appearance</p>
          <Segmented
            options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }]}
            value={theme}
            onChange={setTheme}
          />
        </div>
        <div className="mt-4 border-t border-line-soft pt-4">
          <p className="text-sm font-medium text-ink mb-2.5">Display font</p>
          <div className="flex flex-wrap gap-1.5">
            {FONT_OPTIONS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFont(f.id)}
                aria-pressed={font === f.id}
                className={`pressable rounded-xl border px-3 py-2 text-left transition-colors ${
                  font === f.id ? "border-accent bg-accent-soft" : "border-line hover:bg-surface-2"
                }`}
              >
                <span className="block text-lg leading-none text-ink" style={{ fontFamily: FONT_VARS[f.id] }}>
                  {f.sample}
                </span>
                <span className="mt-1 block text-[0.7rem] text-ink-3">{f.label}</span>
              </button>
            ))}
          </div>
          <p className="mt-2.5 text-xs text-ink-3">Changes headings and quotes throughout the app.</p>
        </div>
      </Card>

      {/* your data */}
      <Card className="p-5 mb-3">
        <p className="text-sm font-medium text-ink">Your data is yours</p>
        <p className="text-sm text-ink-2 mt-1 leading-relaxed">
          Download everything: {db.items.length} items, {db.seeds.length} seeds,{" "}
          {db.actions.length} actions, as JSON, anytime. Use it however you like, including
          with AI tools. We never sell personal data.
        </p>
        <div className="mt-4">
          <Button small variant="soft" onClick={download} disabled={exporting}>
            {exporting ? "Preparing…" : "Export everything"}
          </Button>
        </div>
      </Card>

      <Card className="p-5 mb-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-ink">New here?</p>
            <p className="text-xs text-ink-3">Capture → organize → act → reflect</p>
          </div>
          <Link href="/guide"><Button small variant="soft">How it works</Button></Link>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-line-soft pt-4">
          <div>
            <p className="text-sm font-medium text-ink">The full guide</p>
            <p className="text-xs text-ink-3">Every feature explained, with examples</p>
          </div>
          {/* a static book shipped with the app, not an app page — plain link */}
          <a href="/docs/" target="_blank" rel="noreferrer">
            <Button small variant="soft">Open the guide</Button>
          </a>
        </div>
      </Card>

      <Card className="p-5 mb-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-ink">Trash</p>
            <p className="text-xs text-ink-3">
              {trashedItems.length > 0 ? `${trashedItems.length} deleted item${trashedItems.length === 1 ? "" : "s"}` : "Recently deleted items"}
            </p>
          </div>
          <Link href="/trash"><Button small variant="soft">Open trash</Button></Link>
        </div>
      </Card>

      {owner && (
        <Card className="p-5 mb-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-ink">Owner tools</p>
              <p className="text-xs text-ink-3">Users, subscriptions, app stats</p>
            </div>
            <Link href="/admin"><Button small variant="soft">Open admin</Button></Link>
          </div>
        </Card>
      )}

      {user && (
        <div className="mt-6 text-center">
          <Button variant="ghost" onClick={signOut}>Sign out</Button>
        </div>
      )}

      <p className="mt-10 text-center text-xs text-ink-3 leading-relaxed">
        LoopUpward · a place where you build yourself
        <br />
        {mode === "cloud" ? "Synced to your private cloud." : "Stored on this device."}
      </p>
    </div>
  );
}
