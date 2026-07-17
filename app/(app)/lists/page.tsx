"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLife } from "@/lib/data/provider";
import { formatEntryAmount, itemProgress, listTotals } from "@/lib/progress";
import { Item } from "@/lib/types";
import { Bar } from "@/components/progress";
import { BackLink, Button, Chip, EmptyState, Field, Sheet, inputCls } from "@/components/ui";

export default function ListsPage() {
  const { db } = useLife();
  const [creating, setCreating] = useState(false);
  // one list open at a time — the index stays a scannable grid of small
  // cards no matter how many lists (and how long each one) there are
  const [openId, setOpenId] = useState<string | null>(null);

  const lists = useMemo(
    () =>
      db.items
        .filter((i) => i.kind === "list" && i.status === "active")
        .sort((a, b) => a.position - b.position),
    [db.items]
  );

  return (
    <div className="rise-in max-w-2xl">
      <BackLink fallback="/today" label="Today" />
      <header className="pt-2 pb-4">
        <p className="text-sm text-ink-3">Anything worth ticking off, in one place</p>
        <h1 className="font-display text-[2rem] leading-tight text-ink mt-1">Lists</h1>
      </header>

      <p className="mb-6 text-sm leading-relaxed text-ink-2">
        A list is checkable contents under one name — groceries, exercises, people to
        thank. Entries can carry amounts (&ldquo;2 kg&rdquo;, &ldquo;₹500&rdquo;) that add up per unit,
        and stay ticked once done. A list is a normal life node too: file it under an
        area, park it at someday, nest it inside a goal.
      </p>

      <div className="mb-4">
        <Button small onClick={() => setCreating(true)}>+ New list</Button>
      </div>

      {lists.length === 0 ? (
        <EmptyState
          emoji="📋"
          title="No lists yet"
          body="Name one, then fill it — buying lists, exercise lists, anything checkable."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {lists.map((l) =>
            l.id === openId ? (
              <div key={l.id} className="sm:col-span-2">
                <ListCard item={l} onCollapse={() => setOpenId(null)} />
              </div>
            ) : (
              <CompactListCard key={l.id} item={l} onOpen={() => setOpenId(l.id)} />
            )
          )}
        </div>
      )}

      <CreateListSheet open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

/** The index card: name and the numbers, nothing else — clicking it opens
 *  the full tickable view in place. */
function CompactListCard({ item, onOpen }: { item: Item; onOpen: () => void }) {
  const { db } = useLife();
  const entries = item.entries ?? [];
  const done = entries.filter((e) => e.done).length;
  const totals = listTotals(entries);
  const progress = itemProgress(db, item);

  return (
    <button
      onClick={onOpen}
      className="pressable rounded-(--radius-card) border border-line-soft bg-surface p-4 text-left shadow-(--shadow-card) transition-colors hover:border-accent"
    >
      <p className="truncate font-display text-lg text-ink">{item.title}</p>
      <p className="mt-0.5 text-xs text-ink-3">
        {entries.length === 0
          ? "empty"
          : `${entries.length} thing${entries.length === 1 ? "" : "s"} · ${done} done`}
        {totals && ` · ${totals}`}
      </p>
      {entries.length > 0 && progress !== null && (
        <div className="mt-2.5">
          <Bar value={progress} height={3} />
        </div>
      )}
    </button>
  );
}

function ListCard({ item, onCollapse }: { item: Item; onCollapse: () => void }) {
  const { db, updateItem } = useLife();
  const entries = item.entries ?? [];
  const done = entries.filter((e) => e.done).length;
  const totals = listTotals(entries);
  const progress = itemProgress(db, item);

  const toggle = (id: string) =>
    updateItem(item.id, {
      entries: entries.map((e) => (e.id === id ? { ...e, done: !e.done } : e)),
    });

  return (
    <div className="rounded-(--radius-card) border border-accent/40 bg-surface p-4 shadow-(--shadow-card)">
      <div className="flex items-start justify-between gap-3">
        <button onClick={onCollapse} className="pressable min-w-0 text-left" aria-expanded>
          <p className="font-display text-lg text-ink">
            {item.title} <span aria-hidden className="text-sm text-ink-3">˄</span>
          </p>
          <p className="mt-0.5 text-xs text-ink-3">
            {entries.length === 0 ? "empty" : `${done}/${entries.length} done`}
            {totals && ` · ${totals}`}
          </p>
        </button>
        <div className="flex shrink-0 items-center gap-1.5">
          {/* a buying list gets reused — one tap arms it for the next round */}
          {done > 0 && (
            <button
              onClick={() => updateItem(item.id, { entries: entries.map((e) => ({ ...e, done: false })) })}
              className="pressable rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink-2 hover:border-accent"
            >
              ↺ Untick all
            </button>
          )}
          <Link
            href={`/item/${item.id}`}
            className="pressable rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink-2 hover:border-accent"
          >
            edit ↗
          </Link>
        </div>
      </div>

      {entries.length > 0 && progress !== null && (
        <div className="mt-3">
          <Bar value={progress} height={4} />
        </div>
      )}

      {entries.length > 0 ? (
        <div className="mt-3 space-y-1">
          {entries.map((e) => (
            <div key={e.id} className="flex items-center gap-2.5 text-sm">
              <button
                onClick={() => toggle(e.id)}
                aria-label={e.done ? `Untick "${e.text}"` : `Tick "${e.text}"`}
                className={`pressable grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 transition-colors ${
                  e.done ? "border-accent bg-accent text-white dark:text-[#10160f]" : "border-line hover:border-accent"
                }`}
              >
                {e.done && (
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6.5 4.8 9 10 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
              <span className={`min-w-0 truncate ${e.done ? "text-ink-3 line-through decoration-ink-3/40" : "text-ink-2"}`}>
                {e.text}
              </span>
              {e.amount != null && (
                <span className="ml-auto shrink-0 text-xs text-ink-3 tabular-nums">
                  {formatEntryAmount(e.amount, e.unit)}
                </span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-xs text-ink-3">
          Nothing on it yet — <Link href={`/item/${item.id}`} className="text-accent-deep font-medium">open it</Link> and
          start adding.
        </p>
      )}
    </div>
  );
}

function CreateListSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, addItem } = useLife();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [areaId, setAreaId] = useState<string | null>(null);
  const sortedAreas = useMemo(() => [...db.areas].sort((a, b) => a.position - b.position), [db.areas]);

  const save = () => {
    if (!title.trim()) return;
    const item = addItem({ title, kind: "list", tracker: "none", areaId });
    onClose();
    setTitle("");
    if (item) router.push(`/item/${item.id}`);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New list"
      primary={{ label: "Create — then fill it", onClick: save }}
      primaryDisabled={!title.trim()}
    >
      <Field label="Name it">
        <input
          className={inputCls}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Groceries, Push day, People to thank…"
          autoFocus
        />
      </Field>

      {sortedAreas.length > 0 && (
        <Field label="Which part of life is this for?">
          <div className="flex flex-wrap gap-1.5">
            <Chip active={areaId === null} onClick={() => setAreaId(null)}>None</Chip>
            {sortedAreas.map((a) => (
              <Chip key={a.id} active={areaId === a.id} onClick={() => setAreaId(a.id)}>
                {a.emoji} {a.name}
              </Chip>
            ))}
          </div>
        </Field>
      )}
    </Sheet>
  );
}
