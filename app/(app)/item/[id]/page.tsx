"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useLife } from "@/lib/data/provider";
import { KIND_META } from "@/lib/types";
import {
  ancestors, bestStreak, children as childrenOf, currentStreak,
  formatValue, habitDays, itemProgress,
} from "@/lib/progress";
import { areaColor } from "@/lib/palette";
import { today } from "@/lib/dates";
import { ItemCard, ItemSheet, TrackerControls } from "@/components/items";
import { Bar, Heatmap, Ring, StatTile } from "@/components/progress";
import { Button, EmptyState, Sheet, inputCls } from "@/components/ui";

export default function ItemPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const {
    db, theme, updateItem, deleteItem, completeItem, reopenItem, addAction, premium,
  } = useLife();
  const [addingChild, setAddingChild] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [todayPiece, setTodayPiece] = useState("");

  const item = db.items.find((i) => i.id === id);
  const kids = useMemo(() => (item ? childrenOf(db, item.id) : []), [db, item]);
  const crumbs = useMemo(() => (item ? ancestors(db, item).reverse() : []), [db, item]);
  const days = useMemo(() => (item ? habitDays(db.logs, item.id) : new Set<string>()), [db.logs, item]);

  if (!item) {
    return (
      <EmptyState emoji="🍂" title="Nothing here" body="This item may have been removed.">
        <Link href="/life" className="text-accent-deep font-medium text-sm">Back to your life →</Link>
      </EmptyState>
    );
  }

  const progress = itemProgress(db, item);
  const area = db.areas.find((a) => a.id === item.areaId);
  const c = areaColor(area?.color);
  const color = theme === "dark" ? c.fgDark : c.fg;
  const meta = KIND_META[item.kind];
  const isHabit = item.tracker === "habit";
  const openActions = db.actions.filter((a) => a.itemId === item.id && !a.done);

  const addPiece = () => {
    if (!todayPiece.trim()) return;
    addAction(todayPiece, today(), item.id);
    setTodayPiece("");
  };

  return (
    <div className="rise-in pb-4">
      {/* breadcrumb — where this lives in your life */}
      <nav className="pt-2 text-xs text-ink-3 flex flex-wrap items-center gap-1">
        {area ? (
          <Link href={`/life/${area.id}`} className="hover:text-ink-2">{area.emoji} {area.name}</Link>
        ) : (
          <Link href="/life" className="hover:text-ink-2">Your life</Link>
        )}
        {crumbs.map((a) => (
          <span key={a.id} className="flex items-center gap-1">
            <span>/</span>
            <Link href={`/item/${a.id}`} className="hover:text-ink-2">{a.title}</Link>
          </span>
        ))}
      </nav>

      <header className="pt-4 pb-2 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-3">
            {meta.emoji} {meta.label}
            {item.status === "done" && <span className="text-accent-deep"> · complete</span>}
            {item.status === "someday" && " · someday"}
          </p>
          <h1 className="font-display text-[1.7rem] leading-tight text-ink mt-1 break-words">
            {item.title}
          </h1>
        </div>
        {progress !== null && !isHabit && (
          <Ring value={progress} size={72} stroke={7} color={color} label={`${Math.round(progress * 100)}%`} />
        )}
      </header>

      {item.note && (
        <p className="text-[0.95rem] text-ink-2 leading-relaxed whitespace-pre-wrap mb-4">{item.note}</p>
      )}

      {/* tracker */}
      {(item.tracker === "counter" || item.tracker === "money" || item.tracker === "percent" || item.tracker === "book") && (
        <div className="rounded-(--radius-card) border border-line-soft bg-surface p-4 shadow-(--shadow-card) mb-4">
          <TrackerControls item={item} />
          {item.target != null && progress !== null && (
            <div className="mt-3">
              <Bar value={progress} color={color} />
            </div>
          )}
          {item.tracker === "book" && item.target != null && (
            <p className="text-xs text-ink-3 mt-2 text-center">
              chapter {Math.min(item.current, item.target)} of {item.target}
            </p>
          )}
        </div>
      )}

      {/* habit heatmap & streaks */}
      {isHabit && (
        <div className="mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Current streak" value={`${currentStreak(days)}`} sub="days" accent />
            <StatTile label="Best streak" value={`${bestStreak(days)}`} sub="days" />
          </div>
          <div className="rounded-(--radius-card) border border-line-soft bg-surface p-4 shadow-(--shadow-card)">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-3 mb-3">
              Last {premium ? 16 : 8} weeks
            </p>
            <Heatmap counts={new Map([...days].map((d) => [d, 1]))} weeks={premium ? 16 : 8} />
            {!premium && (
              <p className="text-xs text-ink-3 mt-2">
                <Link href="/pricing" className="text-accent-deep font-medium">Premium</Link> keeps your full history.
              </p>
            )}
          </div>
        </div>
      )}

      {/* break off a piece for today */}
      {item.status === "active" && !isHabit && (
        <div className="mb-6">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-3 mb-2">
            Break off a piece for today
          </p>
          <div className="flex gap-2">
            <input
              className={inputCls}
              value={todayPiece}
              onChange={(e) => setTodayPiece(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addPiece()}
              placeholder={`e.g. "${suggestPiece(item.title)}"`}
            />
            <Button small onClick={addPiece} disabled={!todayPiece.trim()}>Today</Button>
          </div>
          {openActions.length > 0 && (
            <p className="text-xs text-ink-3 mt-2">
              {openActions.length} open in <Link href="/today" className="text-accent-deep">Today</Link>
            </p>
          )}
        </div>
      )}

      {/* nesting: what's inside */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-3">Inside this</p>
          <Button small variant="ghost" onClick={() => setAddingChild(true)}>+ Add</Button>
        </div>
        {kids.length === 0 ? (
          <p className="text-sm text-ink-3">
            Big things are built from smaller ones. Nest a year goal, a monthly goal, a
            chapter — progress flows upward.
          </p>
        ) : (
          <div className="space-y-2">
            {kids.map((k) => (
              <ItemCard key={k.id} item={k} />
            ))}
          </div>
        )}
      </section>

      {/* actions */}
      <div className="flex flex-wrap gap-2 border-t border-line-soft pt-4">
        {item.status === "active" ? (
          <Button small variant="soft" onClick={() => completeItem(item.id)}>Mark complete</Button>
        ) : (
          <Button small variant="soft" onClick={() => reopenItem(item.id)}>Reopen</Button>
        )}
        {item.status === "active" && (
          <Button small variant="ghost" onClick={() => updateItem(item.id, { status: "someday" })}>
            Someday
          </Button>
        )}
        {item.status === "someday" && (
          <Button small variant="ghost" onClick={() => updateItem(item.id, { status: "active" })}>
            Make active
          </Button>
        )}
        <Button small variant="ghost" onClick={() => setEditing(true)}>Edit</Button>
        <Button small variant="danger" onClick={() => setConfirmDelete(true)}>Delete</Button>
      </div>

      <ItemSheet open={addingChild} onClose={() => setAddingChild(false)} defaultParentId={item.id} />
      <ItemSheet open={editing} onClose={() => setEditing(false)} editing={item} />

      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Let this go?">
        <p className="text-sm text-ink-2 leading-relaxed mb-4">
          “{item.title}” will be removed.
          {kids.length > 0 && ` The ${kids.length} things inside move up a level — they aren't lost.`}
        </p>
        <div className="flex gap-2">
          <Button
            variant="danger"
            full
            onClick={() => {
              const dest = crumbs.length ? `/item/${crumbs[crumbs.length - 1].id}` : area ? `/life/${area.id}` : "/life";
              deleteItem(item.id);
              router.push(dest);
            }}
          >
            Delete
          </Button>
          <Button variant="ghost" full onClick={() => setConfirmDelete(false)}>Keep</Button>
        </div>
      </Sheet>
    </div>
  );
}

function suggestPiece(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("read") || t.includes("book")) return "Read one chapter";
  if (t.includes("run") || t.includes("marathon")) return "Run 3 km";
  if (t.includes("learn")) return "Practice 30 minutes";
  if (t.includes("save") || t.includes("₹") || t.includes("$")) return "Review spending for 10 minutes";
  return "One small step (15 minutes)";
}
