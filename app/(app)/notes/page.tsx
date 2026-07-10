"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useLife } from "@/lib/data/provider";
import { children as childrenOf } from "@/lib/progress";
import { Button, EmptyState, Field, Sheet, inputCls } from "@/components/ui";

export default function NotesRootPage() {
  const { db, addItem } = useLife();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const notes = db.items
    .filter((i) => i.kind === "note" && !i.parentId && i.status === "active")
    .sort((a, b) => a.position - b.position);

  const create = () => {
    if (!name.trim()) {
      setNameError(true);
      nameRef.current?.focus();
      return;
    }
    addItem({ title: name.trim(), kind: "note", tracker: "none" });
    setName("");
    setNameError(false);
    setAdding(false);
  };

  return (
    <div className="rise-in lg:max-w-2xl">
      <header className="pt-6 pb-6 flex items-end justify-between">
        <div>
          <p className="text-sm text-ink-3">Group your notes</p>
          <h1 className="font-display text-[2rem] leading-tight text-ink mt-1">Notes</h1>
        </div>
        <Button small variant="soft" onClick={() => setAdding(true)}>+ New folder</Button>
      </header>

      {notes.length === 0 ? (
        <EmptyState
          emoji="🗂"
          title="No folders yet"
          body="A folder groups notes that belong together — 'July 2026', 'Rich shopping list', 'Recipes'. Create one, then add notes inside."
        >
          <Button onClick={() => setAdding(true)}>Create your first folder</Button>
        </EmptyState>
      ) : (
        <div className="space-y-2">
          {notes.map((n) => {
            const kids = childrenOf(db, n.id).filter((k) => k.kind === "note");
            return (
              <Link
                key={n.id}
                href={`/notes/${n.id}`}
                className="pressable flex items-center justify-between gap-3 rounded-(--radius-card) border border-line-soft bg-surface px-4 py-3.5 shadow-(--shadow-card)"
              >
                <span className="min-w-0 truncate text-[0.95rem] text-ink">🗂 {n.title}</span>
                {kids.length > 0 && (
                  <span className="shrink-0 text-xs text-ink-3">{kids.length} note{kids.length === 1 ? "" : "s"}</span>
                )}
              </Link>
            );
          })}
        </div>
      )}

      <Sheet
        open={adding}
        onClose={() => { setAdding(false); setName(""); setNameError(false); }}
        title="New folder"
        primary={{ label: "Create", onClick: create }}
      >
        <Field label="Name">
          <input
            ref={nameRef}
            className={`${inputCls} ${nameError ? "border-danger focus:border-danger" : ""}`}
            value={name}
            onChange={(e) => { setName(e.target.value); if (nameError) setNameError(false); }}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder="July 2026, Rich shopping, Recipes…"
            autoFocus
            aria-invalid={nameError}
          />
          {nameError && (
            <p className="mt-1.5 text-xs text-danger">Give it a name first.</p>
          )}
        </Field>
      </Sheet>
    </div>
  );
}
