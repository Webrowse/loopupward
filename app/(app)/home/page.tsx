"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useLife } from "@/lib/data/provider";
import { greeting, today } from "@/lib/dates";
import { Seed, SPACE_KINDS } from "@/lib/types";
import { itemProgress, todayEntries } from "@/lib/progress";
import { areaColor } from "@/lib/palette";
import { ItemSheet } from "@/components/items";
import { Bar, Ring } from "@/components/progress";
import { Button, Sheet } from "@/components/ui";

const WHISPERS = [
  "I want to run a marathon",
  "Read Atomic Habits",
  "Save ₹50,000",
  "Learn Japanese",
  "Quote: discipline creates freedom",
  "Fix my sleep",
];

export default function HomePage() {
  const { db, user, addSeed, mode, cloudAvailable } = useLife();
  const [text, setText] = useState("");
  const [justPlanted, setJustPlanted] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const inbox = db.seeds
    .filter((s) => s.status === "inbox" && !s.itemId)
    .sort((a, b) => b.createdAt - a.createdAt);
  const resting = db.seeds
    .filter((s) => s.status === "later" && !s.itemId)
    .sort((a, b) => b.createdAt - a.createdAt);

  const capture = () => {
    if (!text.trim()) return;
    addSeed(text);
    setText("");
    setJustPlanted(true);
    setTimeout(() => setJustPlanted(false), 1800);
    inputRef.current?.focus();
  };

  const name = user?.name?.split(" ")[0];
  const isEmpty = inbox.length === 0 && db.items.length === 0;

  return (
    <div className="rise-in">
      <header className="pt-6 pb-8 lg:pb-6">
        <p className="text-sm text-ink-3">{greeting()}{name ? `, ${name}` : ""}.</p>
        <h1 className="font-display text-[2rem] leading-tight text-ink mt-1">
          What is on your mind?
        </h1>
      </header>

      {/* desktop: three quiet columns; mobile: single flow */}
      <div className="lg:grid lg:grid-cols-3 lg:gap-8 lg:items-start">
        {/* — column 1: capture + seeds — */}
        <div>
          <div className="rounded-(--radius-card) border border-line bg-surface shadow-(--shadow-card) focus-within:border-accent transition-colors">
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  capture();
                }
              }}
              placeholder="A thought, a goal, a quote, a someday…"
              rows={3}
              className="w-full resize-none bg-transparent px-4 pt-4 pb-2 text-[1.05rem] text-ink placeholder:text-ink-3 outline-none"
            />
            <div className="flex items-center justify-between px-3 pb-3">
              <span className={`text-xs transition-opacity ${justPlanted ? "text-accent opacity-100" : "opacity-0"}`}>
                ✓ captured — organize it whenever you like
              </span>
              <Button small onClick={capture} disabled={!text.trim()}>Capture</Button>
            </div>
          </div>

          {isEmpty && (
            <div className="mt-10 text-center">
              <p className="text-sm text-ink-3 mb-4">People plant things like…</p>
              <div className="flex flex-wrap justify-center gap-2">
                {WHISPERS.map((w) => (
                  <button
                    key={w}
                    onClick={() => { setText(w); inputRef.current?.focus(); }}
                    className="pressable rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm text-ink-2"
                  >
                    {w}
                  </button>
                ))}
              </div>
              <p className="mt-10 text-[0.95rem] leading-relaxed text-ink-3 max-w-xs mx-auto">
                This is a place where you build yourself. Capture first — give things a
                shape later. <Link href="/guide" className="text-accent-deep">How it works →</Link>
              </p>
            </div>
          )}

          {inbox.length > 0 && <SeedInbox seeds={inbox} />}
          {resting.length > 0 && <RestingSeeds seeds={resting} />}

          <div className="mt-8 flex items-center justify-between text-sm lg:hidden">
            <Link href="/space" className="text-ink-3 hover:text-ink-2">Your quiet space →</Link>
            {cloudAvailable && mode === "local" && (
              <Link href="/login" className="text-accent-deep font-medium">
                Sign in to keep this safe
              </Link>
            )}
          </div>
        </div>

        {/* — column 2: today + active goals (desktop only) — */}
        <div className="hidden lg:block space-y-6">
          <TodayPanel />
          <GoalsPanel />
        </div>

        {/* — column 3: areas + quiet space (desktop only) — */}
        <div className="hidden lg:block space-y-6">
          <AreasPanel />
          <SpacePanel />
          {cloudAvailable && mode === "local" && (
            <p className="text-sm">
              <Link href="/login" className="text-accent-deep font-medium">
                Sign in to keep this safe →
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ————— seed inbox with one-tap triage ————— */

function SeedInbox({ seeds }: { seeds: Seed[] }) {
  const { addItem, plantSeed, setSeedStatus, deleteSeed } = useLife();
  const [shaping, setShaping] = useState<Seed | null>(null);
  const [confirming, setConfirming] = useState<Seed | null>(null);

  const quick = (seed: Seed, kind: "goal" | "habit" | "note") => {
    const title = seed.text.replace(/^quote:\s*/i, "").trim();
    const item = addItem({
      title,
      kind,
      tracker: kind === "goal" ? "check" : kind === "habit" ? "habit" : "none",
      cadence: kind === "habit" ? "daily" : null,
    });
    if (item) plantSeed(seed, item);
  };

  return (
    <section className="mt-8 lg:mt-6">
      <h2 className="text-xs font-medium uppercase tracking-wide text-ink-3 mb-3">
        Seeds — {seeds.length} waiting
      </h2>
      <div className="space-y-2">
        {seeds.map((seed) => (
          <div
            key={seed.id}
            className="rise-in rounded-(--radius-card) border border-line-soft bg-surface px-4 py-3 shadow-(--shadow-card)"
          >
            <p className="text-[0.95rem] text-ink leading-snug">{seed.text}</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-sm">
              <TriageChip onClick={() => setShaping(seed)}>🪴 Organize</TriageChip>
              <TriageChip onClick={() => quick(seed, "goal")}>🎯 Goal</TriageChip>
              <TriageChip onClick={() => quick(seed, "habit")}>🔁 Habit</TriageChip>
              <TriageChip onClick={() => setSeedStatus(seed.id, "later")} title="Rests below — nothing is lost">
                🌙 Later
              </TriageChip>
              <TriageChip onClick={() => setSeedStatus(seed.id, "archived")} title="Kept forever, out of sight">
                🫙 Archive
              </TriageChip>
              <button
                onClick={() => setConfirming(seed)}
                className="pressable ml-auto text-xs text-ink-3 hover:text-danger"
              >
                delete
              </button>
            </div>
          </div>
        ))}
      </div>

      <ItemSheet
        open={shaping !== null}
        onClose={() => setShaping(null)}
        initial={shaping?.text.replace(/^quote:\s*/i, "") ?? ""}
        onCreated={(item) => {
          if (shaping) plantSeed(shaping, item);
        }}
      />

      <Sheet
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title="Delete this thought?"
        cancelLabel="Keep it"
        primary={{
          label: "Delete forever",
          danger: true,
          onClick: () => {
            if (confirming) deleteSeed(confirming.id);
            setConfirming(null);
          },
        }}
      >
        <p className="text-sm text-ink-2 leading-relaxed">
          “{confirming?.text}” will be gone for good. If you just want it out of the way,
          Archive keeps it safe and hidden instead.
        </p>
      </Sheet>
    </section>
  );
}

/** Seeds resting in "later" — visible, never vanished. */
function RestingSeeds({ seeds }: { seeds: Seed[] }) {
  const { setSeedStatus } = useLife();
  const [openList, setOpenList] = useState(false);

  return (
    <section className="mt-6">
      <button
        onClick={() => setOpenList((v) => !v)}
        className="pressable flex w-full items-center justify-between text-xs font-medium uppercase tracking-wide text-ink-3"
      >
        <span>🌙 Resting — {seeds.length}</span>
        <span>{openList ? "hide" : "show"}</span>
      </button>
      {openList && (
        <div className="mt-3 space-y-2">
          {seeds.map((seed) => (
            <div
              key={seed.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-line-soft bg-surface px-4 py-2.5"
            >
              <p className="min-w-0 truncate text-sm text-ink-2">{seed.text}</p>
              <button
                onClick={() => setSeedStatus(seed.id, "inbox")}
                className="pressable shrink-0 text-xs font-medium text-accent-deep"
              >
                wake ↑
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function TriageChip({
  children, onClick, title,
}: { children: React.ReactNode; onClick: () => void; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="pressable rounded-full border border-line bg-bg px-2.5 py-1 text-xs font-medium text-ink-2 hover:border-accent hover:text-accent-deep"
    >
      {children}
    </button>
  );
}

/* ————— desktop dashboard panels ————— */

function Panel({ title, href, children }: { title: string; href: string; children: React.ReactNode }) {
  return (
    <section className="rounded-(--radius-card) border border-line-soft bg-surface p-5 shadow-(--shadow-card)">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-xs font-medium uppercase tracking-wide text-ink-3">{title}</h2>
        <Link href={href} className="text-xs text-accent-deep font-medium">open →</Link>
      </div>
      {children}
    </section>
  );
}

function TodayPanel() {
  const { db, toggleEntry } = useLife();
  const day = today();
  const entries = useMemo(() => todayEntries(db, day), [db, day]);
  const done = entries.filter((e) => e.action.done).length;

  return (
    <Panel title="Today" href="/today">
      {entries.length === 0 ? (
        <p className="text-sm text-ink-3">A clear day. Break a small piece off a goal.</p>
      ) : (
        <div className="flex items-start gap-4">
          <Ring value={done / entries.length} size={56} stroke={6} label={`${done}/${entries.length}`} />
          <div className="min-w-0 flex-1 space-y-1.5">
            {entries.slice(0, 5).map((e) => (
              <button
                key={e.action.id}
                onClick={() => toggleEntry(e)}
                className={`block w-full truncate text-left text-sm ${
                  e.action.done ? "text-ink-3 line-through decoration-ink-3/40" : "text-ink-2 hover:text-ink"
                }`}
              >
                {e.action.done ? "✓" : "○"} {e.action.title}
              </button>
            ))}
            {entries.length > 5 && (
              <p className="text-xs text-ink-3">+{entries.length - 5} more</p>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

function GoalsPanel() {
  const { db, theme } = useLife();
  const goals = db.items
    .filter((i) => !i.parentId && i.status === "active" && !SPACE_KINDS.includes(i.kind))
    .slice(0, 6);

  return (
    <Panel title="Growing now" href="/life">
      {goals.length === 0 ? (
        <p className="text-sm text-ink-3">Nothing planted yet.</p>
      ) : (
        <div className="space-y-3">
          {goals.map((g) => {
            const p = itemProgress(db, g);
            const c = areaColor(db.areas.find((a) => a.id === g.areaId)?.color);
            return (
              <Link key={g.id} href={`/item/${g.id}`} className="block">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-ink">{g.title}</span>
                  {p !== null && (
                    <span className="shrink-0 text-xs text-ink-3 tabular-nums">{Math.round(p * 100)}%</span>
                  )}
                </div>
                {p !== null && (
                  <div className="mt-1">
                    <Bar value={p} color={theme === "dark" ? c.fgDark : c.fg} height={5} />
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function AreasPanel() {
  const { db, theme } = useLife();
  const areas = [...db.areas].sort((a, b) => a.position - b.position);

  return (
    <Panel title="Your life" href="/life">
      {areas.length === 0 ? (
        <p className="text-sm text-ink-3">No areas yet — the rooms of your life.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {areas.map((a) => {
            const c = areaColor(a.color);
            return (
              <Link
                key={a.id}
                href={`/life/${a.id}`}
                className="pressable rounded-full border border-line-soft px-3 py-1.5 text-sm text-ink"
                style={{ background: theme === "dark" ? c.bgDark : c.bg }}
              >
                {a.emoji} {a.name}
              </Link>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function SpacePanel() {
  const { db } = useLife();
  const kept = db.items
    .filter((i) => SPACE_KINDS.includes(i.kind) && i.status !== "archived")
    .sort((a, b) => b.createdAt - a.createdAt);
  const quote = kept.find((k) => k.kind === "quote") ?? kept[0];

  return (
    <Panel title="Quiet space" href="/space">
      {quote ? (
        <blockquote className="font-display text-[1.05rem] leading-relaxed text-ink">
          {quote.kind === "quote" ? `“${quote.title}”` : quote.title}
        </blockquote>
      ) : (
        <p className="text-sm text-ink-3">Quotes, principles, promises — words to keep.</p>
      )}
    </Panel>
  );
}
