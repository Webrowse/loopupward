"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLife } from "@/lib/data/provider";
import { Item } from "@/lib/types";
import { children as childrenOf } from "@/lib/progress";
import { deriveNoteFields, NOTE_HEADING_MAX } from "@/components/items";
import { RichTextEditor } from "@/components/richtext";
import { Button, EmptyState, Field, Sheet, inputCls } from "@/components/ui";
import { NoteMoveSheet } from "./[id]/page";

function preview(html: string | null): string {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export default function NotesRootPage() {
  const { db, addItem, deleteItem } = useLife();
  const [addingFolder, setAddingFolder] = useState(false);
  const [addingNote, setAddingNote] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderNameError, setFolderNameError] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [noteTitleError, setNoteTitleError] = useState(false);
  const folderNameRef = useRef<HTMLInputElement>(null);
  const noteTitleRef = useRef<HTMLInputElement>(null);

  // Keep-style selection: as soon as one note is checked, tapping any other
  // note toggles it too instead of opening it — no separate "select mode"
  // toggle needed
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [movingItems, setMovingItems] = useState<Item[] | null>(null);
  const [menuForId, setMenuForId] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string[] | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close the 3-dot menu on any outside click. A `fixed inset-0` overlay
  // button doesn't work here: the note card's `.pressable:active` transform
  // makes the card a CSS containing block for its fixed children mid-click,
  // shrinking the overlay's hit area to just the card's own box.
  useEffect(() => {
    if (!menuForId) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuForId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuForId]);

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const folders = db.items
    .filter((i) => i.kind === "folder" && i.status === "active")
    .sort((a, b) => a.position - b.position);
  const freeNotes = db.items
    .filter((i) => i.kind === "note" && !i.parentId && i.status === "active")
    .sort((a, b) => b.createdAt - a.createdAt);

  const closeFolderSheet = () => {
    setAddingFolder(false);
    setFolderName("");
    setFolderNameError(false);
  };

  const createFolder = () => {
    if (!folderName.trim()) {
      setFolderNameError(true);
      folderNameRef.current?.focus();
      return;
    }
    addItem({ title: folderName.trim(), kind: "folder", tracker: "none" });
    closeFolderSheet();
  };

  const closeNoteSheet = () => {
    setAddingNote(false);
    setNoteTitle("");
    setNoteBody("");
    setNoteTitleError(false);
  };

  const createNote = () => {
    if (!noteTitle.trim()) {
      setNoteTitleError(true);
      noteTitleRef.current?.focus();
      return;
    }
    const trimmedTitle = noteTitle.trim();
    // a long thought typed straight into the title field shouldn't be lost —
    // fold it into the body (ahead of whatever's already there) and keep
    // just a short heading, same as organizing a long seed does. A normal
    // short title stays untouched — it's not also duplicated into the body.
    if (trimmedTitle.length > NOTE_HEADING_MAX || trimmedTitle.includes("\n")) {
      const split = deriveNoteFields(trimmedTitle);
      const richBody = noteBody ? `${split.richBody}<br>${noteBody}` : split.richBody;
      addItem({ title: split.title, richBody, kind: "note", tracker: "none" });
    } else {
      addItem({ title: trimmedTitle, richBody: noteBody, kind: "note", tracker: "none" });
    }
    closeNoteSheet();
  };

  return (
    <div className="rise-in lg:max-w-3xl">
      <header className="pt-6 pb-6 flex items-end justify-between gap-2">
        {selected.size > 0 ? (
          <>
            <p className="text-sm font-medium text-ink">{selected.size} selected</p>
            <div className="flex gap-2">
              <Button small variant="ghost" onClick={() => setSelected(new Set())}>Cancel</Button>
              <Button
                small
                variant="soft"
                onClick={() => setMovingItems(freeNotes.filter((n) => selected.has(n.id)))}
              >
                Move to folder
              </Button>
              <Button small variant="danger" onClick={() => setConfirmingDelete([...selected])}>
                Delete
              </Button>
            </div>
          </>
        ) : (
          <>
            <div>
              <p className="text-sm text-ink-3">Capture, then sort later</p>
              <h1 className="font-display text-[2rem] leading-tight text-ink mt-1">Notes</h1>
            </div>
            <div className="flex gap-2">
              <Button small variant="ghost" onClick={() => setAddingFolder(true)}>+ Folder</Button>
              <Button small variant="soft" onClick={() => setAddingNote(true)}>+ Note</Button>
            </div>
          </>
        )}
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
          body="Jot a quick note, or start a folder to group ones that belong together, like 'July 2026', 'Rich shopping list', 'Recipes'."
        >
          <Button onClick={() => setAddingNote(true)}>Write your first note</Button>
        </EmptyState>
      ) : freeNotes.length === 0 ? (
        <p className="text-sm text-ink-3">No loose notes right now. They&rsquo;ll show up here.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {freeNotes.map((n) => {
            const isSelected = selected.has(n.id);
            return (
              <Link
                key={n.id}
                href={`/notes/${n.id}`}
                onClick={(e) => {
                  if (selected.size > 0) {
                    e.preventDefault();
                    toggleSelected(n.id);
                  }
                }}
                className="pressable group relative flex flex-col rounded-(--radius-card) border border-line-soft bg-surface p-3.5 pt-7 shadow-(--shadow-card) min-h-28"
              >
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleSelected(n.id); }}
                  aria-label={isSelected ? "Deselect note" : "Select note"}
                  className={`touch-visible absolute left-2 top-2 z-10 grid h-5 w-5 place-items-center rounded-full border-2 transition-colors ${
                    isSelected
                      ? "border-accent bg-accent text-white dark:text-[#10160f]"
                      : "border-line bg-surface opacity-0 group-hover:opacity-100"
                  }`}
                >
                  {isSelected && (
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6.5 4.8 9 10 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
                {selected.size === 0 && (
                  <div className="contents" ref={menuForId === n.id ? menuRef : undefined}>
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuForId(menuForId === n.id ? null : n.id); }}
                      aria-label="More actions"
                      className="touch-visible absolute right-1.5 top-1.5 z-10 grid h-6 w-6 place-items-center rounded-full text-ink-3 opacity-0 group-hover:opacity-100 hover:bg-surface-2 hover:text-ink-2"
                    >
                      ⋮
                    </button>
                    {menuForId === n.id && (
                      <div className="absolute right-1.5 top-8 z-30 w-40 overflow-hidden rounded-xl border border-line-soft bg-surface shadow-(--shadow-float)">
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMovingItems([n]); setMenuForId(null); }}
                          className="block w-full px-3.5 py-2.5 text-left text-sm text-ink hover:bg-surface-2"
                        >
                          Move to folder
                        </button>
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmingDelete([n.id]); setMenuForId(null); }}
                          className="block w-full px-3.5 py-2.5 text-left text-sm text-danger hover:bg-surface-2"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                )}
                <span className="min-w-0 truncate text-[0.95rem] font-medium text-ink">{n.title}</span>
                {preview(n.richBody) && (
                  <span className="mt-1 text-xs text-ink-3 leading-relaxed line-clamp-4">{preview(n.richBody)}</span>
                )}
              </Link>
            );
          })}
        </div>
      )}

      <Sheet
        open={addingFolder}
        onClose={closeFolderSheet}
        title="New folder"
        primary={{ label: "Create", onClick: createFolder }}
      >
        <Field label="Name">
          <input
            ref={folderNameRef}
            className={`${inputCls} ${folderNameError ? "border-danger focus:border-danger" : ""}`}
            value={folderName}
            onChange={(e) => { setFolderName(e.target.value); if (folderNameError) setFolderNameError(false); }}
            placeholder="July 2026, Rich shopping, Recipes…"
            autoFocus
            aria-invalid={folderNameError}
          />
          {folderNameError && (
            <p className="mt-1.5 text-xs text-danger">Give it a name first.</p>
          )}
        </Field>
      </Sheet>

      <Sheet
        open={addingNote}
        onClose={closeNoteSheet}
        title="New note"
        wide
        primary={{ label: "Create", onClick: createNote }}
      >
        <Field label="Title">
          <input
            ref={noteTitleRef}
            className={`${inputCls} ${noteTitleError ? "border-danger focus:border-danger" : ""}`}
            value={noteTitle}
            onChange={(e) => { setNoteTitle(e.target.value); if (noteTitleError) setNoteTitleError(false); }}
            placeholder="A quick thought…"
            autoFocus
            aria-invalid={noteTitleError}
          />
          {noteTitleError && (
            <p className="mt-1.5 text-xs text-danger">Give it a name first.</p>
          )}
        </Field>
        <Field label="Note">
          <RichTextEditor value={noteBody} onChange={setNoteBody} placeholder="Write it all here…" minHeightClass="min-h-40" />
        </Field>
        <p className="text-xs text-ink-3">
          It stays loose here until you drop it into a folder, or never do.
        </p>
      </Sheet>

      {movingItems && (
        <NoteMoveSheet
          open
          onClose={() => { setMovingItems(null); setSelected(new Set()); }}
          items={movingItems}
        />
      )}

      <Sheet
        open={confirmingDelete !== null}
        onClose={() => setConfirmingDelete(null)}
        title="Let this go?"
        cancelLabel="Keep"
        primary={{
          label: "Delete",
          danger: true,
          onClick: () => {
            if (confirmingDelete) {
              for (const id of confirmingDelete) deleteItem(id);
              setSelected(new Set());
            }
            setConfirmingDelete(null);
          },
        }}
      >
        <p className="text-sm text-ink-2">
          {confirmingDelete && confirmingDelete.length > 1
            ? `${confirmingDelete.length} notes will be removed.`
            : "This note will be removed."}
        </p>
      </Sheet>
    </div>
  );
}
