"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useLife } from "@/lib/data/provider";
import { children as childrenOf } from "@/lib/progress";
import { Button, EmptyState, Field, Sheet, inputCls } from "@/components/ui";

function preview(html: string | null): string {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export default function NotesRootPage() {
  const { db, addItem } = useLife();
  const [addingFolder, setAddingFolder] = useState(false);
  const [addingNote, setAddingNote] = useState(false);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const folders = db.items
    .filter((i) => i.kind === "folder" && i.status === "active")
    .sort((a, b) => a.position - b.position);
  const freeNotes = db.items
    .filter((i) => i.kind === "note" && !i.parentId && i.status === "active")
    .sort((a, b) => b.createdAt - a.createdAt);

  const closeSheets = () => {
    setAddingFolder(false);
    setAddingNote(false);
    setName("");
    setNameError(false);
  };

  const create = () => {
    if (!name.trim()) {
      setNameError(true);
      nameRef.current?.focus();
      return;
    }
    addItem({ title: name.trim(), kind: addingFolder ? "folder" : "note", tracker: "none" });
    closeSheets();
  };

  return (
    <div className="rise-in lg:max-w-3xl">
      <header className="pt-6 pb-6 flex items-end justify-between gap-2">
        <div>
          <p className="text-sm text-ink-3">Capture, then sort later</p>
          <h1 className="font-display text-[2rem] leading-tight text-ink mt-1">Notes</h1>
        </div>
        <div className="flex gap-2">
          <Button small variant="ghost" onClick={() => setAddingFolder(true)}>+ Folder</Button>
          <Button small variant="soft" onClick={() => setAddingNote(true)}>+ Note</Button>
        </div>
      </header>

      {folders.length > 0 && (
        <section className="mb-6">
          <div className="flex flex-wrap gap-2">
            {folders.map((f) => {
              const kids = childrenOf(db, f.id).filter((k) => k.kind === "note");
              return (
                <Link
                  key={f.id}
                  href={`/notes/${f.id}`}
                  className="pressable flex items-center gap-1.5 rounded-full border border-line-soft bg-surface px-3.5 py-2 text-sm text-ink shadow-(--shadow-card)"
                >
                  🗂️ {f.title}
                  {kids.length > 0 && <span className="text-xs text-ink-3">{kids.length}</span>}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {freeNotes.length === 0 && folders.length === 0 ? (
        <EmptyState
          emoji="🗒"
          title="Nothing here yet"
          body="Jot a quick note, or start a folder to group ones that belong together — 'July 2026', 'Rich shopping list', 'Recipes'."
        >
          <Button onClick={() => setAddingNote(true)}>Write your first note</Button>
        </EmptyState>
      ) : freeNotes.length === 0 ? (
        <p className="text-sm text-ink-3">No loose notes right now — they&rsquo;ll show up here.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {freeNotes.map((n) => (
            <Link
              key={n.id}
              href={`/notes/${n.id}`}
              className="pressable flex flex-col rounded-(--radius-card) border border-line-soft bg-surface p-3.5 shadow-(--shadow-card) min-h-28"
            >
              <span className="min-w-0 truncate text-[0.95rem] font-medium text-ink">{n.title}</span>
              {preview(n.richBody) && (
                <span className="mt-1 text-xs text-ink-3 leading-relaxed line-clamp-4">{preview(n.richBody)}</span>
              )}
            </Link>
          ))}
        </div>
      )}

      <Sheet
        open={addingFolder}
        onClose={closeSheets}
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

      <Sheet
        open={addingNote}
        onClose={closeSheets}
        title="New note"
        primary={{ label: "Create", onClick: create }}
      >
        <Field label="Title">
          <input
            ref={nameRef}
            className={`${inputCls} ${nameError ? "border-danger focus:border-danger" : ""}`}
            value={name}
            onChange={(e) => { setName(e.target.value); if (nameError) setNameError(false); }}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder="A quick thought…"
            autoFocus
            aria-invalid={nameError}
          />
          {nameError && (
            <p className="mt-1.5 text-xs text-danger">Give it a name first.</p>
          )}
        </Field>
        <p className="text-xs text-ink-3">
          It stays loose here until you drop it into a folder — or never do.
        </p>
      </Sheet>
    </div>
  );
}
