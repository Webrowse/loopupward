"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLife } from "@/lib/data/provider";
import { AREA_COLORS, areaColor } from "@/lib/palette";
import { itemProgress } from "@/lib/progress";
import { Bar } from "@/components/progress";
import { Button, EmptyState, Field, Sheet, inputCls } from "@/components/ui";

const EMOJI_IDEAS = ["🌿", "💪", "🧠", "💼", "💰", "📚", "✈️", "🗣", "❤️", "🎨", "🏔", "🍳"];

export default function LifePage() {
  const { db, addArea, limits, premium } = useLife();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🌿");
  const [color, setColor] = useState(AREA_COLORS[0].key);

  const areas = [...db.areas].sort((a, b) => a.position - b.position);
  const unfiled = db.items.filter(
    (i) => !i.areaId && !i.parentId && i.status === "active"
  );

  const save = () => {
    if (!name.trim()) return;
    addArea(name, emoji, color);
    setName("");
    setEmoji("🌿");
    setAdding(false);
  };

  return (
    <div className="rise-in">
      <header className="pt-6 pb-6 flex items-end justify-between">
        <div>
          <p className="text-sm text-ink-3">The shape of</p>
          <h1 className="font-display text-[2rem] leading-tight text-ink mt-1">Your life</h1>
        </div>
        <Button small variant="soft" onClick={() => setAdding(true)} disabled={!limits.canAddArea}>
          + Area
        </Button>
      </header>

      {!limits.canAddArea && !premium && (
        <p className="mb-4 text-sm text-ink-3">
          Free includes {db.areas.length} life areas.{" "}
          <Link href="/pricing" className="text-accent-deep font-medium">Go unlimited →</Link>
        </p>
      )}

      {areas.length === 0 ? (
        <EmptyState
          emoji="🗺"
          title="No areas yet — and that's fine"
          body="Areas are the rooms of your life: Health, Money, Books, French… Create them when your seeds start wanting a home."
        >
          <Button onClick={() => setAdding(true)}>Create your first area</Button>
        </EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {areas.map((area) => (
            <AreaCard key={area.id} areaId={area.id} />
          ))}
        </div>
      )}

      {unfiled.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xs font-medium uppercase tracking-wide text-ink-3 mb-3">
            Not filed anywhere yet
          </h2>
          <div className="space-y-2">
            {unfiled.slice(0, 8).map((i) => (
              <Link
                key={i.id}
                href={`/item/${i.id}`}
                className="block rounded-xl border border-line-soft bg-surface px-4 py-2.5 text-[0.95rem] text-ink shadow-(--shadow-card)"
              >
                {i.title}
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="mt-10 text-sm">
        <Link href="/space" className="text-ink-3 hover:text-ink-2">
          Quotes, principles, memories → your quiet space
        </Link>
      </div>

      <Sheet open={adding} onClose={() => setAdding(false)} title="A new room in your life">
        <Field label="Name">
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Health, Money, French…"
            autoFocus
          />
        </Field>
        <Field label="Symbol">
          <div className="flex flex-wrap gap-1.5">
            {EMOJI_IDEAS.map((e) => (
              <button
                key={e}
                onClick={() => setEmoji(e)}
                className={`pressable grid h-10 w-10 place-items-center rounded-xl border text-lg ${
                  emoji === e ? "border-accent bg-accent-soft" : "border-line bg-surface"
                }`}
              >
                {e}
              </button>
            ))}
            <input
              className={`${inputCls} w-16 text-center`}
              value={emoji}
              onChange={(e) => setEmoji(e.target.value.slice(0, 4))}
              aria-label="Custom emoji"
            />
          </div>
        </Field>
        <Field label="Color">
          <div className="flex flex-wrap gap-2">
            {AREA_COLORS.map((c) => (
              <button
                key={c.key}
                onClick={() => setColor(c.key)}
                aria-label={c.label}
                className={`h-8 w-8 rounded-full border-2 ${color === c.key ? "border-ink" : "border-transparent"}`}
                style={{ background: c.fg }}
              />
            ))}
          </div>
        </Field>
        <Button full onClick={save} disabled={!name.trim()}>Create</Button>
      </Sheet>
    </div>
  );
}

function AreaCard({ areaId }: { areaId: string }) {
  const { db, theme } = useLife();
  const area = db.areas.find((a) => a.id === areaId)!;
  const c = areaColor(area.color);
  const dark = theme === "dark";
  const items = db.items.filter((i) => i.areaId === areaId && !i.parentId && i.status !== "archived");
  const active = items.filter((i) => i.status === "active");
  const progresses = items
    .map((i) => itemProgress(db, i))
    .filter((v): v is number => v !== null);
  const avg = progresses.length ? progresses.reduce((a, b) => a + b, 0) / progresses.length : null;

  return (
    <Link
      href={`/life/${area.id}`}
      className="pressable block rounded-(--radius-card) border border-line-soft p-4 shadow-(--shadow-card)"
      style={{ background: dark ? c.bgDark : c.bg }}
    >
      <div className="text-2xl">{area.emoji}</div>
      <div className="mt-2 font-medium text-[0.95rem] text-ink leading-snug">{area.name}</div>
      <div className="text-xs text-ink-2 mt-0.5">
        {active.length === 0 ? "empty" : `${active.length} growing`}
      </div>
      {avg !== null && (
        <div className="mt-3">
          <Bar value={avg} color={dark ? c.fgDark : c.fg} height={5} />
        </div>
      )}
    </Link>
  );
}
