"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLife } from "@/lib/data/provider";
import { ItemKind, KIND_META, SPACE_KINDS } from "@/lib/types";
import { Button, Chip, EmptyState } from "@/components/ui";
import { ItemSheet } from "@/components/items";

const SPACE_LABELS: Record<string, string> = {
  quote: "Quotes",
  principle: "Life principles",
  promise: "Promises to myself",
  lesson: "Lessons learned",
  memory: "Important memories",
  idea: "Ideas",
  dream: "Dreams",
};

export default function SpacePage() {
  const { db, deleteItem } = useLife();
  const [filter, setFilter] = useState<ItemKind | "all">("all");
  const [adding, setAdding] = useState(false);

  const entries = useMemo(
    () =>
      db.items
        .filter((i) => SPACE_KINDS.includes(i.kind) && i.status !== "archived")
        .filter((i) => filter === "all" || i.kind === filter)
        .sort((a, b) => b.createdAt - a.createdAt),
    [db.items, filter]
  );

  return (
    <div className="rise-in">
      <header className="pt-6 pb-6">
        <p className="text-sm text-ink-3">Words to keep</p>
        <h1 className="font-display text-[2rem] leading-tight text-ink mt-1">Quiet space</h1>
        <p className="text-sm text-ink-2 mt-2 leading-relaxed">
          Quotes, principles, promises, lessons — the inner material you&apos;re built from.
        </p>
      </header>

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-2 -mx-5 px-5">
        <Chip active={filter === "all"} onClick={() => setFilter("all")}>All</Chip>
        {SPACE_KINDS.map((k) => (
          <Chip key={k} active={filter === k} onClick={() => setFilter(k)}>
            {KIND_META[k].emoji} {SPACE_LABELS[k]}
          </Chip>
        ))}
      </div>

      <div className="mt-3 mb-4 flex justify-end">
        <Button small variant="soft" onClick={() => setAdding(true)}>+ Keep something</Button>
      </div>

      {entries.length === 0 ? (
        <EmptyState
          emoji="🫙"
          title="Nothing kept yet"
          body="When a quote changes how you think, or you make yourself a promise — keep it here. Future you will read these."
        >
          <Link href="/home" className="text-accent-deep font-medium text-sm">
            Capture a thought →
          </Link>
        </EmptyState>
      ) : (
        <div className="space-y-3 lg:columns-2 lg:gap-4 lg:space-y-0 xl:columns-3 [&>*]:lg:mb-4 [&>*]:lg:break-inside-avoid">
          {entries.map((e) => (
            <div
              key={e.id}
              className="rise-in group rounded-(--radius-card) border border-line-soft bg-surface p-5 shadow-(--shadow-card)"
            >
              {e.kind === "quote" ? (
                <blockquote className="font-display text-lg leading-relaxed text-ink">
                  “{e.title}”
                </blockquote>
              ) : (
                <p className="text-[1rem] leading-relaxed text-ink">{e.title}</p>
              )}
              {e.note && <p className="mt-2 text-sm text-ink-2 whitespace-pre-wrap">{e.note}</p>}
              <div className="mt-3 flex items-center justify-between text-xs text-ink-3">
                <span>
                  {KIND_META[e.kind].emoji} {SPACE_LABELS[e.kind] ?? KIND_META[e.kind].label} ·{" "}
                  {new Date(e.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                </span>
                <button
                  onClick={() => deleteItem(e.id)}
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:text-danger"
                >
                  remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ItemSheet open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
