"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useLife } from "@/lib/data/provider";
import { Item } from "@/lib/types";
import { children as childrenOf } from "@/lib/progress";
import { ItemSheet } from "@/components/items";
import { RichTextEditor } from "@/components/richtext";
import { BackLink, Button, Chip, EmptyState, Field, Sheet, inputCls } from "@/components/ui";

export default function NotePage() {
  const { id } = useParams<{ id: string }>();
  const { db } = useLife();
  const item = db.items.find((i) => i.id === id && (i.kind === "note" || i.kind === "folder"));

  if (!item) {
    return (
      <EmptyState emoji="🍂" title="Nothing here" body="This may have been removed.">
        <Link href="/notes" className="text-accent-deep font-medium text-sm">Back to your notes →</Link>
      </EmptyState>
    );
  }

  return item.kind === "folder" ? <FolderPage item={item} /> : <NotePageBody item={item} />;
}

function FolderPage({ item }: { item: Item }) {
  const { db, updateItem, deleteItem } = useLife();
  const router = useRouter();
  const [title, setTitle] = useState(item.title);
  const [justSaved, setJustSaved] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [lastId, setLastId] = useState(item.id);
  if (item.id !== lastId) {
    setLastId(item.id);
    setTitle(item.title);
    setJustSaved(false);
  }

  const kids = childrenOf(db, item.id).filter((k) => k.kind === "note");
  const dirty = title.trim() !== item.title;

  const save = () => {
    if (!dirty || !title.trim()) return;
    updateItem(item.id, { title: title.trim() });
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1800);
  };

  return (
    <div className="rise-in pb-4 lg:max-w-2xl">
      <div className="pt-2">
        <BackLink fallback="/notes" label="Back" />
      </div>

      <nav className="pt-2 text-xs text-ink-3">
        <Link href="/notes" className="hover:text-ink-2">🗒 Notes</Link>
      </nav>

      <div className="mt-3 flex items-center gap-2">
        <span className="shrink-0 text-2xl leading-tight">🗂️</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="min-w-0 flex-1 bg-transparent font-display text-[1.7rem] leading-tight text-ink outline-none"
        />
        {dirty ? (
          <Button small onClick={save}>Save</Button>
        ) : justSaved ? (
          <span className="shrink-0 text-xs text-accent-deep">✓ saved</span>
        ) : null}
      </div>

      <section className="mt-6">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-3">Notes in this folder</p>
          <Button small variant="ghost" onClick={() => setAdding(true)}>+ Add</Button>
        </div>
        {kids.length === 0 ? (
          <p className="text-sm text-ink-3">Notes you keep in this folder will show up here.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {kids.map((k) => (
              <Link
                key={k.id}
                href={`/notes/${k.id}`}
                className="pressable flex flex-col rounded-(--radius-card) border border-line-soft bg-surface p-3.5 shadow-(--shadow-card) min-h-24"
              >
                <span className="min-w-0 truncate text-[0.95rem] font-medium text-ink">{k.title}</span>
                {preview(k.richBody) && (
                  <span className="mt-1 text-xs text-ink-3 leading-relaxed line-clamp-3">{preview(k.richBody)}</span>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line-soft pt-4">
        <Button small variant="danger" onClick={() => setConfirmDelete(true)}>Delete folder</Button>
      </div>

      <NewChildSheet open={adding} onClose={() => setAdding(false)} parentId={item.id} areaId={item.areaId} />

      <Sheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Let this go?"
        cancelLabel="Keep"
        primary={{
          label: "Delete",
          danger: true,
          onClick: () => {
            deleteItem(item.id);
            router.replace("/notes");
          },
        }}
      >
        <p className="text-sm text-ink-2 leading-relaxed">
          &ldquo;{item.title}&rdquo; will be removed.
          {kids.length > 0 && ` The ${kids.length} note${kids.length === 1 ? "" : "s"} inside become loose notes — they aren't lost.`}
        </p>
      </Sheet>
    </div>
  );
}

function NotePageBody({ item }: { item: Item }) {
  const { db, updateItem, deleteItem } = useLife();
  const router = useRouter();

  const [title, setTitle] = useState(item.title);
  const [richBody, setRichBody] = useState(item.richBody ?? "");
  const [justSaved, setJustSaved] = useState(false);
  const [moving, setMoving] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const [justOrganized, setJustOrganized] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [lastId, setLastId] = useState(item.id);
  if (item.id !== lastId) {
    setLastId(item.id);
    setTitle(item.title);
    setRichBody(item.richBody ?? "");
    setJustSaved(false);
  }

  const folder = item.parentId ? db.items.find((i) => i.id === item.parentId) : null;
  const dirty = title !== item.title || richBody !== (item.richBody ?? "");

  const save = () => {
    if (!dirty) return;
    updateItem(item.id, {
      ...(title.trim() && title !== item.title ? { title: title.trim() } : {}),
      ...(richBody !== (item.richBody ?? "") ? { richBody } : {}),
    });
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1800);
  };

  return (
    <div className="rise-in pb-4 lg:max-w-2xl">
      <div className="pt-2">
        <BackLink fallback={folder ? `/notes/${folder.id}` : "/notes"} label="Back" />
      </div>

      <nav className="pt-2 text-xs text-ink-3 flex flex-wrap items-center gap-1">
        <Link href="/notes" className="hover:text-ink-2">🗒 Notes</Link>
        {folder && (
          <span className="flex items-center gap-1">
            <span>/</span>
            <Link href={`/notes/${folder.id}`} className="hover:text-ink-2">🗂️ {folder.title}</Link>
          </span>
        )}
      </nav>

      <div className="mt-3 flex items-center justify-between gap-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="min-w-0 flex-1 bg-transparent font-display text-[1.7rem] leading-tight text-ink outline-none"
        />
        {dirty ? (
          <Button small onClick={save}>Save</Button>
        ) : justSaved ? (
          <span className="shrink-0 text-xs text-accent-deep">✓ saved</span>
        ) : null}
      </div>

      <div className="mt-4">
        <RichTextEditor
          value={richBody}
          onChange={setRichBody}
          placeholder="Write whatever this note needs to hold…"
          minHeightClass="min-h-56"
        />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line-soft pt-4">
        <Button small variant="ghost" onClick={() => setOrganizing(true)}>Organize into something</Button>
        {justOrganized && <span className="text-xs text-accent-deep">✓ created — this note is unchanged</span>}
        <Button small variant="ghost" onClick={() => setMoving(true)}>Move</Button>
        <Button small variant="danger" onClick={() => setConfirmDelete(true)}>Delete</Button>
      </div>

      {/* "Organize" plants a brand-new, independent item from this note's
          title — never touches this note's own content or place */}
      <ItemSheet
        open={organizing}
        onClose={() => setOrganizing(false)}
        initial={item.title}
        onCreated={() => {
          setJustOrganized(true);
          setTimeout(() => setJustOrganized(false), 2200);
        }}
      />

      <NoteMoveSheet open={moving} onClose={() => setMoving(false)} item={item} />

      <Sheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Let this go?"
        cancelLabel="Keep"
        primary={{
          label: "Delete",
          danger: true,
          onClick: () => {
            deleteItem(item.id);
            router.replace(folder ? `/notes/${folder.id}` : "/notes");
          },
        }}
      >
        <p className="text-sm text-ink-2 leading-relaxed">&ldquo;{item.title}&rdquo; will be removed.</p>
      </Sheet>
    </div>
  );
}

function preview(html: string | null | undefined): string {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function NewChildSheet({
  open, onClose, parentId, areaId,
}: { open: boolean; onClose: () => void; parentId: string; areaId: string | null }) {
  const { addItem } = useLife();
  const [name, setName] = useState("");
  const [error, setError] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  const create = () => {
    if (!name.trim()) {
      setError(true);
      ref.current?.focus();
      return;
    }
    addItem({ title: name.trim(), kind: "note", tracker: "none", parentId, areaId });
    setName("");
    setError(false);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={() => { onClose(); setName(""); setError(false); }}
      title="New note"
      primary={{ label: "Create", onClick: create }}
    >
      <Field label="Title">
        <input
          ref={ref}
          className={`${inputCls} ${error ? "border-danger focus:border-danger" : ""}`}
          value={name}
          onChange={(e) => { setName(e.target.value); if (error) setError(false); }}
          placeholder="A smaller thought that belongs here…"
          autoFocus
          aria-invalid={error}
        />
        {error && <p className="mt-1.5 text-xs text-danger">Give it a name first.</p>}
      </Field>
    </Sheet>
  );
}

function NoteMoveSheet({ open, onClose, item }: { open: boolean; onClose: () => void; item: Item }) {
  const { db, moveItem, addItem } = useLife();
  const [newFolderName, setNewFolderName] = useState("");
  const [creating, setCreating] = useState(false);

  const folders = db.items
    .filter((i) => i.kind === "folder" && i.status === "active")
    .sort((a, b) => a.title.localeCompare(b.title));

  const createAndMove = () => {
    if (!newFolderName.trim()) return;
    const folder = addItem({ title: newFolderName.trim(), kind: "folder", tracker: "none" });
    if (folder) moveItem(item.id, { parentId: folder.id });
    setNewFolderName("");
    setCreating(false);
  };

  return (
    <Sheet open={open} onClose={onClose} title="Move" cancelLabel="Close" primary={{ label: "Done", onClick: onClose }}>
      <Field label="Move into">
        <div className="flex flex-wrap gap-1.5">
          <Chip active={item.parentId === null} onClick={() => moveItem(item.id, { parentId: null })}>
            No folder
          </Chip>
          {folders.map((f) => (
            <Chip key={f.id} active={item.parentId === f.id} onClick={() => moveItem(item.id, { parentId: f.id })}>
              🗂️ {f.title}
            </Chip>
          ))}
        </div>
      </Field>

      {creating ? (
        <Field label="New folder name">
          <div className="flex gap-2">
            <input
              className={inputCls}
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); createAndMove(); } }}
              placeholder="Recipes, July 2026…"
              autoFocus
            />
            <Button small onClick={createAndMove}>Create</Button>
          </div>
        </Field>
      ) : (
        <button className="text-sm font-medium text-accent-deep" onClick={() => setCreating(true)}>
          + New folder
        </button>
      )}
    </Sheet>
  );
}
