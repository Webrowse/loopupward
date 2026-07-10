"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLife } from "@/lib/data/provider";
import { Item } from "@/lib/types";
import { ancestors, children as childrenOf } from "@/lib/progress";
import { ItemSheet } from "@/components/items";
import { RichTextEditor } from "@/components/richtext";
import { BackLink, Button, Chip, EmptyState, Field, Sheet, inputCls } from "@/components/ui";

export default function NotePage() {
  const { id } = useParams<{ id: string }>();
  const { db, updateItem, deleteItem } = useLife();
  const item = db.items.find((i) => i.id === id && i.kind === "note");

  const [title, setTitle] = useState(item?.title ?? "");
  const [richBody, setRichBody] = useState(item?.richBody ?? "");
  const [justSaved, setJustSaved] = useState(false);
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const [justOrganized, setJustOrganized] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [lastId, setLastId] = useState(id);
  if (id !== lastId) {
    setLastId(id);
    setTitle(item?.title ?? "");
    setRichBody(item?.richBody ?? "");
    setJustSaved(false);
  }

  if (!item) {
    return (
      <EmptyState emoji="🍂" title="Nothing here" body="This note may have been removed.">
        <Link href="/notes" className="text-accent-deep font-medium text-sm">Back to your notes →</Link>
      </EmptyState>
    );
  }

  const crumbs = ancestors(db, item).reverse();
  // a folder is a top-level note; notes inside a folder are a flat list —
  // they never hold notes of their own, so there's only ever one level deep
  const isFolder = item.parentId === null;
  const kids = isFolder ? childrenOf(db, item.id).filter((k) => k.kind === "note") : [];

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
        <BackLink fallback={crumbs.length ? `/notes/${crumbs[crumbs.length - 1].id}` : "/notes"} label="Back" />
      </div>

      <nav className="pt-2 text-xs text-ink-3 flex flex-wrap items-center gap-1">
        <Link href="/notes" className="hover:text-ink-2">🗒 Notes</Link>
        {crumbs.map((a) => (
          <span key={a.id} className="flex items-center gap-1">
            <span>/</span>
            <Link href={`/notes/${a.id}`} className="hover:text-ink-2">{a.title}</Link>
          </span>
        ))}
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
          placeholder={isFolder ? "Optional notes about this folder…" : "Write whatever this note needs to hold…"}
          minHeightClass="min-h-56"
        />
      </div>

      {isFolder && (
        <section className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-3">Notes in this folder</p>
            <Button small variant="ghost" onClick={() => setAdding(true)}>+ Add</Button>
          </div>
          {kids.length === 0 ? (
            <p className="text-sm text-ink-3">
              Notes you keep in this folder will show up here.
            </p>
          ) : (
            <div className="space-y-2">
              {kids.map((k) => (
                <Link
                  key={k.id}
                  href={`/notes/${k.id}`}
                  className="pressable flex items-center gap-2 rounded-xl border border-line-soft bg-surface px-4 py-3 shadow-(--shadow-card)"
                >
                  <span className="min-w-0 truncate text-[0.95rem] text-ink">🗒 {k.title}</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line-soft pt-4">
        <Button small variant="ghost" onClick={() => setOrganizing(true)}>Organize into something</Button>
        {justOrganized && <span className="text-xs text-accent-deep">✓ created — this note is unchanged</span>}
        {!isFolder && <Button small variant="ghost" onClick={() => setMoving(true)}>Move</Button>}
        <Button small variant="danger" onClick={() => setConfirmDelete(true)}>Delete</Button>
      </div>

      <NewChildSheet
        open={adding}
        onClose={() => setAdding(false)}
        parentId={item.id}
        areaId={item.areaId}
      />

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
            setConfirmDelete(false);
          },
        }}
      >
        <p className="text-sm text-ink-2 leading-relaxed">
          &ldquo;{item.title}&rdquo; will be removed.
          {kids.length > 0 && ` The ${kids.length} notes inside become top-level folders — they aren't lost.`}
        </p>
      </Sheet>
    </div>
  );
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
          onKeyDown={(e) => e.key === "Enter" && create()}
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
  const { db, moveItem } = useLife();
  // notes only ever move between folders — never into another note
  const candidates = db.items
    .filter((i) => i.kind === "note" && i.status === "active" && i.parentId === null && i.id !== item.id)
    .sort((a, b) => a.title.localeCompare(b.title));

  return (
    <Sheet open={open} onClose={onClose} title="Move" cancelLabel="Close" primary={{ label: "Done", onClick: onClose }}>
      <Field label="Move into folder">
        <div className="flex flex-wrap gap-1.5">
          {candidates.map((c) => (
            <Chip key={c.id} active={item.parentId === c.id} onClick={() => moveItem(item.id, { parentId: c.id })}>
              🗂 {c.title}
            </Chip>
          ))}
        </div>
        {candidates.length === 0 && (
          <p className="mt-2 text-xs text-ink-3">No other folders to move this into yet.</p>
        )}
      </Field>
    </Sheet>
  );
}
