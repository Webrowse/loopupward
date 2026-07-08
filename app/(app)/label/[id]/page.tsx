"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useLife } from "@/lib/data/provider";
import { areaColor } from "@/lib/palette";
import { ItemCard } from "@/components/items";
import { BackLink, EmptyState } from "@/components/ui";

export default function LabelPage() {
  const { id } = useParams<{ id: string }>();
  const { db, theme } = useLife();

  const label = db.labels.find((l) => l.id === id);
  if (!label) {
    return (
      <EmptyState emoji="🏷️" title="This label is gone" body="It may have been removed.">
        <Link href="/life" className="text-accent-deep font-medium text-sm">Back to your life →</Link>
      </EmptyState>
    );
  }

  const c = areaColor(label.color);
  const dark = theme === "dark";
  const items = db.items
    .filter((i) => i.labels.includes(label.id) && i.status !== "archived")
    .sort((a, b) => (a.status === b.status ? a.position - b.position : a.status === "done" ? 1 : -1));

  return (
    <div className="rise-in lg:max-w-2xl">
      <div className="pt-2">
        <BackLink fallback="/life" label="Your life" />
      </div>

      <header
        className="mt-3 rounded-(--radius-card) border border-line-soft p-5"
        style={{ background: dark ? c.bgDark : c.bg }}
      >
        <div className="text-3xl">{label.emoji}</div>
        <h1 className="font-display text-[1.8rem] leading-tight text-ink mt-2">{label.name}</h1>
        <p className="text-sm text-ink-2 mt-1">
          {items.length === 0 ? "Nothing tagged yet." : `${items.length} tagged`}
        </p>
      </header>

      {items.length === 0 ? (
        <EmptyState
          emoji={label.emoji}
          title="No items carry this label yet"
          body="Open any goal, habit, or note and add the label from Edit."
        />
      ) : (
        <div className="mt-5 space-y-2">
          {items.map((i) => (
            <ItemCard key={i.id} item={i} hideLabelIds={[label.id]} />
          ))}
        </div>
      )}
    </div>
  );
}
