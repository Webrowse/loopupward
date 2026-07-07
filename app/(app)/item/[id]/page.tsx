"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useLife } from "@/lib/data/provider";
import { HORIZON_META, Item, KIND_META } from "@/lib/types";
import {
  ancestors, bestStreak, children as childrenOf, currentStreak, descendants,
  formatValue, habitDailyTarget, habitDays, itemProgress, scheduleLabel,
} from "@/lib/progress";
import { areaColor } from "@/lib/palette";
import { shortDay, today } from "@/lib/dates";
import { ItemCard, ItemSheet, ScheduleEditor, TrackerControls } from "@/components/items";
import { Bar, Heatmap, Ring, StatTile } from "@/components/progress";
import { Button, Chip, EmptyState, Field, Sheet, inputCls } from "@/components/ui";

export default function ItemPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const {
    db, theme, updateItem, moveItem, deleteItem, completeItem, reopenItem, addAction, premium,
  } = useLife();
  const [addingChild, setAddingChild] = useState(false);
  const [editing, setEditing] = useState(false);
  const [moving, setMoving] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [todayPiece, setTodayPiece] = useState("");

  const item = db.items.find((i) => i.id === id);
  const kids = useMemo(() => (item ? childrenOf(db, item.id) : []), [db, item]);
  const crumbs = useMemo(() => (item ? ancestors(db, item).reverse() : []), [db, item]);
  const days = useMemo(
    () => (item ? habitDays(db.logs, item.id, habitDailyTarget(item)) : new Set<string>()),
    [db.logs, item]
  );

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

  /* history: completed actions + log events for this node, newest first */
  const history = [
    ...db.actions
      .filter((a) => a.itemId === item.id && a.done)
      .map((a) => ({ key: `a${a.id}`, date: a.date, text: a.title, kind: "action" as const, value: 0 })),
    ...db.logs
      .filter((l) => l.itemId === item.id)
      .map((l) => ({
        key: `l${l.id}`, date: l.date, kind: l.op === "set" ? ("set" as const) : ("log" as const),
        text: "", value: l.value,
      })),
  ]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 30);

  const nextStep =
    openActions.length > 0
      ? openActions[0].title
      : kids.find((k) => k.status === "active")?.title ?? null;

  return (
    <div className="rise-in pb-4 lg:max-w-2xl">
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
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-ink-3">
            {item.horizon && (
              <button onClick={() => setScheduling(true)} className="rounded-full bg-surface-2 px-2 py-0.5">
                {HORIZON_META.find((h) => h.value === item.horizon)?.label ?? item.horizon}
              </button>
            )}
            {scheduleLabel(item) && (
              <button onClick={() => setScheduling(true)} className="rounded-full bg-accent-soft px-2 py-0.5 text-accent-deep">
                {scheduleLabel(item)}
              </button>
            )}
          </div>
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

      {/* the next small step */}
      {item.status === "active" && !isHabit && (
        <div className="mb-6">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-3 mb-2">
            {nextStep ? "Next small step" : "Break off a piece for today"}
          </p>
          {nextStep && (
            <p className="text-sm text-ink-2 mb-2">
              → {nextStep}
              {openActions.length > 0 && (
                <span className="text-ink-3"> · waiting in <Link href="/today" className="text-accent-deep">Today</Link></span>
              )}
            </p>
          )}
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

      {/* history */}
      {history.length > 0 && (
        <section className="mb-6">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-3 mb-2">History</p>
          <div className="rounded-(--radius-card) border border-line-soft bg-surface px-4 py-2 shadow-(--shadow-card) divide-y divide-line-soft">
            {history.map((h) => (
              <div key={h.key} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate text-ink-2">
                  {h.kind === "action" && <>✓ {h.text}</>}
                  {h.kind === "log" && (
                    <>+{h.value === 1 && habitDailyTarget(item) === 1 ? "1 day" : formatValue(item, h.value)}</>
                  )}
                  {h.kind === "set" && <>→ {formatValue(item, h.value)}</>}
                </span>
                <span className="shrink-0 text-xs text-ink-3 tabular-nums">{shortDay(h.date)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* actions */}
      <div className="flex flex-wrap gap-2 border-t border-line-soft pt-4">
        {item.status === "active" ? (
          <Button small variant="soft" onClick={() => completeItem(item.id)}>Mark complete</Button>
        ) : (
          <Button small variant="soft" onClick={() => reopenItem(item.id)}>Reopen</Button>
        )}
        <Button small variant="ghost" onClick={() => setMoving(true)}>Move</Button>
        <Button small variant="ghost" onClick={() => setScheduling(true)}>Schedule</Button>
        {item.status === "active" && (
          <Button small variant="ghost" onClick={() => updateItem(item.id, { status: "someday", horizon: "someday" })}>
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
      <MoveSheet open={moving} onClose={() => setMoving(false)} item={item} onMove={moveItem} />
      <ScheduleSheet
        open={scheduling}
        onClose={() => setScheduling(false)}
        item={item}
        onSave={(patch) => updateItem(item.id, patch)}
      />

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

/* ————— Move: reorganize your life anytime ————— */

function MoveSheet({
  open, onClose, item, onMove,
}: {
  open: boolean;
  onClose: () => void;
  item: Item;
  onMove: (id: string, dest: { areaId?: string | null; parentId?: string | null }) => void;
}) {
  const { db } = useLife();
  const [search, setSearch] = useState("");

  // an item can't be nested inside itself or its own descendants
  const forbidden = useMemo(() => {
    const set = new Set(descendants(db, item.id).map((d) => d.id));
    set.add(item.id);
    return set;
  }, [db, item.id]);

  const candidates = db.items
    .filter(
      (i) =>
        !forbidden.has(i.id) &&
        i.status !== "archived" &&
        i.id !== item.parentId &&
        (!search.trim() || i.title.toLowerCase().includes(search.trim().toLowerCase()))
    )
    .slice(0, 12);

  const parent = item.parentId ? db.items.find((i) => i.id === item.parentId) : null;

  return (
    <Sheet open={open} onClose={onClose} title="Move">
      <Field label="Life area">
        <div className="flex flex-wrap gap-1.5">
          <Chip active={item.areaId === null} onClick={() => onMove(item.id, { areaId: null })}>
            None
          </Chip>
          {[...db.areas].sort((a, b) => a.position - b.position).map((a) => (
            <Chip
              key={a.id}
              active={item.areaId === a.id}
              onClick={() => onMove(item.id, { areaId: a.id })}
            >
              {a.emoji} {a.name}
            </Chip>
          ))}
        </div>
      </Field>

      <Field label="Lives inside">
        {parent ? (
          <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-2.5">
            <span className="min-w-0 truncate text-sm text-ink">{parent.title}</span>
            <button
              className="shrink-0 text-xs text-danger"
              onClick={() => onMove(item.id, { parentId: null })}
            >
              remove parent
            </button>
          </div>
        ) : (
          <p className="mb-2 text-sm text-ink-3">Top level — it belongs to no bigger thing yet.</p>
        )}
        <input
          className={inputCls}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search for a new parent…"
        />
        <div className="mt-2 space-y-1.5">
          {candidates.map((cand) => (
            <button
              key={cand.id}
              onClick={() => {
                onMove(item.id, { parentId: cand.id });
                onClose();
              }}
              className="pressable block w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-left text-sm text-ink hover:border-accent"
            >
              {KIND_META[cand.kind].emoji} {cand.title}
            </button>
          ))}
          {search.trim() && candidates.length === 0 && (
            <p className="text-sm text-ink-3">Nothing matches.</p>
          )}
        </div>
      </Field>
    </Sheet>
  );
}

/* ————— Schedule & horizon ————— */

function ScheduleSheet({
  open, onClose, item, onSave,
}: {
  open: boolean;
  onClose: () => void;
  item: Item;
  onSave: (patch: Partial<Item>) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="When?">
      <Field label="Planning horizon">
        <div className="flex flex-wrap gap-1.5">
          <Chip active={item.horizon === null} onClick={() => onSave({ horizon: null })}>None</Chip>
          {HORIZON_META.map((h) => (
            <Chip
              key={h.value}
              active={item.horizon === h.value}
              onClick={() =>
                onSave({
                  horizon: h.value,
                  // moving out of someday makes it active again
                  ...(item.status === "someday" && h.value !== "someday" ? { status: "active" as const } : {}),
                  ...(h.value === "someday" ? { status: "someday" as const } : {}),
                })
              }
            >
              {h.label}
            </Chip>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-3">
          The same thing moves through time: someday → year → month → week → today.
        </p>
      </Field>

      <Field label="Repeats">
        <ScheduleEditor
          value={{ cadence: item.cadence, cadenceDays: item.cadenceDays, cadenceCount: item.cadenceCount }}
          onChange={(v) =>
            onSave({
              cadence: v.cadence,
              cadenceDays: v.cadence === "days" ? v.cadenceDays : null,
              cadenceCount: v.cadence === "weekly" ? v.cadenceCount : null,
            })
          }
        />
      </Field>

      <Button full variant="soft" onClick={onClose}>Done</Button>
    </Sheet>
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
