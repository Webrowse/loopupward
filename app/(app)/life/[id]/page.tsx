"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useLife } from "@/lib/data/provider";
import { areaColor, AREA_COLORS } from "@/lib/palette";
import { ItemCard, ItemSheet } from "@/components/items";
import { BackLink, Button, EmptyState, Field, Sheet, inputCls } from "@/components/ui";

export default function AreaPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { db, theme, updateArea, deleteArea } = useLife();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const area = db.areas.find((a) => a.id === id);
  if (!area) {
    return (
      <EmptyState emoji="🍂" title="This area is gone" body="It may have been removed.">
        <Link href="/life" className="text-accent-deep font-medium text-sm">Back to your life →</Link>
      </EmptyState>
    );
  }

  const c = areaColor(area.color);
  const dark = theme === "dark";
  const roots = db.items
    .filter((i) => i.areaId === area.id && !i.parentId && i.status !== "archived")
    .sort((a, b) => (a.status === b.status ? a.position - b.position : a.status === "done" ? 1 : -1));

  return (
    <div className="rise-in">
      <div className="pt-2">
        <BackLink fallback="/life" label="Your life" />
      </div>
      <header
        className="mt-3 rounded-(--radius-card) p-5 border border-line-soft"
        style={{ background: dark ? c.bgDark : c.bg }}
      >
        <div className="flex items-start justify-between">
          <div className="text-3xl">{area.emoji}</div>
          <button onClick={() => setEditing(true)} className="text-xs text-ink-2 underline underline-offset-2">
            edit
          </button>
        </div>
        <h1 className="font-display text-[1.8rem] leading-tight text-ink mt-2">{area.name}</h1>
        <p className="text-sm text-ink-2 mt-1">
          {roots.length === 0 ? "Nothing here yet." : `${roots.filter((r) => r.status === "active").length} things growing`}
        </p>
      </header>

      <div className="mt-5 flex justify-end">
        <Button small variant="soft" onClick={() => setCreating(true)}>+ Add to {area.name}</Button>
      </div>

      {roots.length === 0 ? (
        <EmptyState
          emoji={area.emoji}
          title={`${area.name} is waiting`}
          body="Plant a goal, a habit, a book — anything that belongs in this part of your life."
        />
      ) : (
        <div className="mt-3 space-y-2">
          {roots.map((i) => (
            <ItemCard key={i.id} item={i} />
          ))}
        </div>
      )}

      <ItemSheet
        open={creating}
        onClose={() => setCreating(false)}
        defaultAreaId={area.id}
      />

      <Sheet
        open={editing}
        onClose={() => { setEditing(false); setConfirmDelete(false); }}
        title="Edit area"
        cancelLabel="Close"
        primary={{ label: "Done", onClick: () => { setEditing(false); setConfirmDelete(false); } }}
      >
        <Field label="Name">
          <input
            className={inputCls}
            defaultValue={area.name}
            onBlur={(e) => e.target.value.trim() && updateArea(area.id, { name: e.target.value.trim() })}
          />
        </Field>
        <Field label="Symbol">
          <input
            className={`${inputCls} w-20 text-center`}
            defaultValue={area.emoji}
            onBlur={(e) => updateArea(area.id, { emoji: e.target.value.slice(0, 4) || "🌿" })}
          />
        </Field>
        <Field label="Color">
          <div className="flex flex-wrap gap-2">
            {AREA_COLORS.map((col) => (
              <button
                key={col.key}
                onClick={() => updateArea(area.id, { color: col.key })}
                aria-label={col.label}
                className={`h-8 w-8 rounded-full border-2 ${area.color === col.key ? "border-ink" : "border-transparent"}`}
                style={{ background: col.fg }}
              />
            ))}
          </div>
        </Field>
        <div className="mt-6 border-t border-line-soft pt-4">
          {!confirmDelete ? (
            <Button variant="danger" full onClick={() => setConfirmDelete(true)}>
              Delete this area
            </Button>
          ) : (
            <div>
              <p className="text-sm text-ink-2 mb-3">
                Everything inside survives — it just loses its room. Delete “{area.name}”?
              </p>
              <div className="flex gap-2">
                <Button
                  variant="danger"
                  full
                  onClick={() => { deleteArea(area.id); router.replace("/life"); }}
                >
                  Yes, delete
                </Button>
                <Button variant="ghost" full onClick={() => setConfirmDelete(false)}>Keep it</Button>
              </div>
            </div>
          )}
        </div>
      </Sheet>
    </div>
  );
}
