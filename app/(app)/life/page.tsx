"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useLife } from "@/lib/data/provider";
import { SPACE_KINDS } from "@/lib/types";
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
  const [nameError, setNameError] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const areas = [...db.areas].sort((a, b) => a.position - b.position);
  // quotes/principles/promises/etc already have a home in Quiet Space,
  // and notes/folders already have a home in Notes — neither needs to
  // also hang loose in "not filed anywhere" here
  const unfiled = db.items.filter(
    (i) =>
      !i.areaId &&
      !i.parentId &&
      i.status === "active" &&
      !SPACE_KINDS.includes(i.kind) &&
      i.kind !== "note" &&
      i.kind !== "folder"
  );

  const closeAdding = () => {
    setAdding(false);
    setName("");
    setEmoji("🌿");
    setNameError(false);
  };

  const save = () => {
    if (!name.trim()) {
      setNameError(true);
      nameRef.current?.focus();
      return;
    }
    addArea(name, emoji, color);
    closeAdding();
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
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
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

      <LabelsSection />

      <div className="mt-10 space-y-2 text-sm">
        <div>
          <Link href="/space" className="text-ink-3 hover:text-ink-2">
            Quotes, principles, memories → your quiet space
          </Link>
        </div>
        <div>
          <Link href="/notes" className="text-ink-3 hover:text-ink-2">
            Longer thoughts, folders of them → your notes
          </Link>
        </div>
      </div>

      <Sheet
        open={adding}
        onClose={closeAdding}
        title="A new room in your life"
        primary={{ label: "Create", onClick: save }}
      >
        <Field label="Name">
          <input
            ref={nameRef}
            className={`${inputCls} ${nameError ? "border-danger focus:border-danger" : ""}`}
            value={name}
            onChange={(e) => { setName(e.target.value); if (nameError) setNameError(false); }}
            placeholder="Health, Money, French…"
            autoFocus
            aria-invalid={nameError}
          />
          {nameError && (
            <p className="mt-1.5 text-xs text-danger">Give this room a name.</p>
          )}
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

/* ————— labels: user-created tags, independent of areas ————— */

function LabelsSection() {
  const { db, addLabel, updateLabel, deleteLabel, theme } = useLife();
  const [managing, setManaging] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("🏷️");
  const [newColor, setNewColor] = useState(AREA_COLORS[0].key);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [newNameError, setNewNameError] = useState(false);
  const newNameRef = useRef<HTMLInputElement>(null);

  const labels = [...db.labels].sort((a, b) => a.position - b.position);
  const dark = theme === "dark";

  const create = () => {
    if (!newName.trim()) {
      setNewNameError(true);
      newNameRef.current?.focus();
      return;
    }
    addLabel(newName, newEmoji, newColor);
    setNewName("");
    setNewEmoji("🏷️");
    setNewNameError(false);
  };

  return (
    <section className="mt-10">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-medium uppercase tracking-wide text-ink-3">Labels</h2>
        <Button small variant="ghost" onClick={() => setManaging(true)}>
          {labels.length === 0 ? "+ Create labels" : "Manage"}
        </Button>
      </div>
      {labels.length === 0 ? (
        <p className="text-sm text-ink-3">
          Tags that cut across areas: Rust, Family, French B2, Confidence…
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {labels.map((l) => {
            const c = areaColor(l.color);
            const count = db.items.filter((i) => i.labels.includes(l.id) && i.status !== "archived").length;
            return (
              <Link
                key={l.id}
                href={`/label/${l.id}`}
                className="pressable inline-flex items-center gap-1.5 rounded-full border border-line-soft px-3 py-1.5 text-sm text-ink"
                style={{ background: dark ? c.bgDark : c.bg }}
              >
                {l.emoji} {l.name}
                {count > 0 && <span className="text-xs text-ink-2">{count}</span>}
              </Link>
            );
          })}
        </div>
      )}

      <Sheet
        open={managing}
        onClose={() => { setManaging(false); setConfirmDelete(null); }}
        title="Labels"
        cancelLabel="Close"
        primary={{ label: "Done", onClick: () => { setManaging(false); setConfirmDelete(null); } }}
      >
        <Field label="New label">
          <div className="flex gap-2">
            <input
              className={`${inputCls} w-14 text-center`}
              value={newEmoji}
              onChange={(e) => setNewEmoji(e.target.value.slice(0, 4))}
              aria-label="Label emoji"
            />
            <input
              ref={newNameRef}
              className={`${inputCls} ${newNameError ? "border-danger focus:border-danger" : ""}`}
              value={newName}
              onChange={(e) => { setNewName(e.target.value); if (newNameError) setNewNameError(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); create(); } }}
              placeholder="Rust, Family, French B2…"
              aria-invalid={newNameError}
            />
            <Button small onClick={create}>Add</Button>
          </div>
          {newNameError && (
            <p className="mt-1.5 text-xs text-danger">Give the label a name first.</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {AREA_COLORS.map((c) => (
              <button
                key={c.key}
                onClick={() => setNewColor(c.key)}
                aria-label={c.label}
                className={`h-6 w-6 rounded-full border-2 ${newColor === c.key ? "border-ink" : "border-transparent"}`}
                style={{ background: c.fg }}
              />
            ))}
          </div>
        </Field>

        {labels.length > 0 && (
          <Field label="Your labels">
            <div className="space-y-2">
              {labels.map((l) => (
                <div key={l.id} className="rounded-xl border border-line px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <input
                      className="w-10 bg-transparent text-center text-base outline-none"
                      defaultValue={l.emoji}
                      onBlur={(e) => updateLabel(l.id, { emoji: e.target.value.slice(0, 4) || "🏷️" })}
                      aria-label="Emoji"
                    />
                    <input
                      className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none"
                      defaultValue={l.name}
                      onBlur={(e) => e.target.value.trim() && updateLabel(l.id, { name: e.target.value.trim() })}
                      aria-label="Name"
                    />
                    {confirmDelete === l.id ? (
                      <span className="flex shrink-0 items-center gap-2 text-xs">
                        <button className="text-danger font-medium" onClick={() => { deleteLabel(l.id); setConfirmDelete(null); }}>
                          confirm
                        </button>
                        <button className="text-ink-3" onClick={() => setConfirmDelete(null)}>keep</button>
                      </span>
                    ) : (
                      <button
                        className="shrink-0 text-xs text-ink-3 hover:text-danger"
                        onClick={() => setConfirmDelete(l.id)}
                      >
                        delete
                      </button>
                    )}
                  </div>
                  {confirmDelete === l.id && (
                    <p className="mt-1.5 text-xs text-ink-3">
                      Items keep living — they just lose this tag.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </Field>
        )}
      </Sheet>
    </section>
  );
}
