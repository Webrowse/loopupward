"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useLife } from "@/lib/data/provider";
import { greeting } from "@/lib/dates";
import { Seed } from "@/lib/types";
import { ItemSheet } from "@/components/items";
import { Button } from "@/components/ui";

const WHISPERS = [
  "I want to run a marathon",
  "Read Atomic Habits",
  "Save ₹50,000",
  "Learn Japanese",
  "Quote: discipline creates freedom",
  "Fix my sleep",
];

export default function HomePage() {
  const { db, user, addSeed, archiveSeed, plantSeed, mode, cloudAvailable } = useLife();
  const [text, setText] = useState("");
  const [justPlanted, setJustPlanted] = useState(false);
  const [planting, setPlanting] = useState<Seed | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const inbox = db.seeds
    .filter((s) => !s.archivedAt && !s.itemId)
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

  return (
    <div className="rise-in">
      <header className="pt-6 pb-8">
        <p className="text-sm text-ink-3">{greeting()}{name ? `, ${name}` : ""}.</p>
        <h1 className="font-display text-[2rem] leading-tight text-ink mt-1">
          What is on your mind?
        </h1>
      </header>

      {/* capture box — the heart of the app */}
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

      {/* whisper suggestions when everything is empty */}
      {inbox.length === 0 && db.items.length === 0 && (
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
            shape later.
          </p>
        </div>
      )}

      {/* seed inbox */}
      {inbox.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xs font-medium uppercase tracking-wide text-ink-3 mb-3">
            Seeds — {inbox.length} waiting
          </h2>
          <div className="space-y-2">
            {inbox.map((seed) => (
              <div
                key={seed.id}
                className="rise-in rounded-(--radius-card) border border-line-soft bg-surface px-4 py-3 shadow-(--shadow-card)"
              >
                <p className="text-[0.95rem] text-ink leading-snug">{seed.text}</p>
                <div className="mt-2.5 flex gap-2">
                  <Button small variant="soft" onClick={() => setPlanting(seed)}>
                    Give it a shape
                  </Button>
                  <Button small variant="ghost" onClick={() => archiveSeed(seed.id)}>
                    Let it rest
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* quiet links */}
      <div className="mt-10 flex items-center justify-between text-sm">
        <Link href="/space" className="text-ink-3 hover:text-ink-2">
          Your quiet space →
        </Link>
        {cloudAvailable && mode === "local" && (
          <Link href="/login" className="text-accent-deep font-medium">
            Sign in to keep this safe
          </Link>
        )}
      </div>

      <ItemSheet
        open={planting !== null}
        onClose={() => setPlanting(null)}
        initial={planting?.text.replace(/^quote:\s*/i, "") ?? ""}
        onCreated={(item) => {
          if (planting) plantSeed(planting, item);
        }}
      />
    </div>
  );
}
