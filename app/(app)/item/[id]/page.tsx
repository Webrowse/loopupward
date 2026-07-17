"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useLife } from "@/lib/data/provider";
import { Horizon, HORIZON_META, Item, KIND_META, ListEntry, RoutineStep } from "@/lib/types";
import {
  ancestors, bestStreak, children as childrenOf, currentStreak, dayLogged, descendants,
  formatValue, habitDailyTarget, habitDays, itemProgress, listTotals, routineLogDay, routineMinutes,
  scheduleLabel,
} from "@/lib/progress";
import { useRowDrag } from "@/lib/useRowDrag";
import { uid } from "@/lib/uid";
import { areaColor } from "@/lib/palette";
import {
  boundingRange, dayFromMs, firstAnchorWithin, nextAnchor, Period, previousAnchor, prettyDay, prettyPeriod,
  shortDay, today,
} from "@/lib/dates";
import { DateGridPicker, ItemCard, ItemSheet, ScheduleEditor, TrackerControls } from "@/components/items";
import { KindIcon } from "@/components/icons";
import { Bar, Heatmap, Ring, StatTile } from "@/components/progress";
import { BackLink, Button, Chip, EmptyState, Field, Sheet, inputCls } from "@/components/ui";

export default function ItemPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const {
    db, theme, updateItem, moveItem, deleteItem, completeItem, reopenItem, addAction, premium,
    toggleHabitDay,
  } = useLife();
  const [addingChild, setAddingChild] = useState(false);
  const [editing, setEditing] = useState(false);
  const [moving, setMoving] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRetire, setConfirmRetire] = useState(false);
  const [todayPiece, setTodayPiece] = useState("");
  const [pieceAmount, setPieceAmount] = useState("1");
  const [showHistory, setShowHistory] = useState(false);

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
  // counter/book goals have a meter a piece can move: "read 2 chapters"
  // done on Today adds 2 here, so a weekly "read 5 chapters" reads 2/5 by
  // itself — no second manual update
  const metered = item.tracker === "counter" || item.tracker === "book";
  const openActions = db.actions.filter((a) => a.itemId === item.id && !a.done);

  const addPiece = () => {
    if (!todayPiece.trim()) return;
    const amt = metered ? Math.max(1, Math.round(parseFloat(pieceAmount) || 1)) : 1;
    addAction(todayPiece, today(), item.id, amt);
    setTodayPiece("");
    setPieceAmount("1");
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
      <div className="pt-2">
        <BackLink fallback={area ? `/life/${area.id}` : "/life"} />
      </div>

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
          <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-ink-3">
            <KindIcon kind={item.kind} /> {meta.label}
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
          <HabitTodayControl item={item} onToggle={toggleHabitDay} />
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Current streak" value={`${currentStreak(days)}`} sub="days" accent />
            <StatTile label="Best streak" value={`${bestStreak(days)}`} sub="days" />
          </div>
          <div className="rounded-(--radius-card) border border-line-soft bg-surface p-4 shadow-(--shadow-card)">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-3 mb-3">
              Last {premium ? 16 : 8} weeks
            </p>
            <Heatmap
              counts={new Map([...days].map((d) => [d, 1]))}
              weeks={premium ? 16 : 8}
              sinceDay={dayFromMs(item.createdAt)}
            />
            {!premium && (
              <p className="text-xs text-ink-3 mt-2">
                <Link href="/pricing" className="text-accent-deep font-medium">Premium</Link> keeps your full history.
              </p>
            )}
          </div>
        </div>
      )}

      {/* a routine's script: its steps and their minutes, and its hours */}
      {item.kind === "routine" && (
        <>
          <RoutineStepsEditor item={item} />
          <RoutineWindowEditor item={item} />
        </>
      )}

      {/* a list's contents: checkable entries, optionally quantified */}
      {item.kind === "list" && <ListEntriesEditor item={item} />}

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
          {metered && (
            <div className="mt-2 flex items-center gap-2 text-xs text-ink-3">
              <span>Finishing it moves the meter by</span>
              <input
                type="number"
                min={1}
                value={pieceAmount}
                onChange={(e) => setPieceAmount(e.target.value)}
                aria-label="How much this piece moves the meter"
                className="w-16 rounded-lg border border-line bg-bg px-2 py-1 text-sm text-ink tabular-nums outline-none focus:border-accent"
              />
              <span>{item.unit ?? (item.tracker === "book" ? "chapters" : "")}</span>
            </div>
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
            chapter. Progress flows upward.
          </p>
        ) : (
          <div className="space-y-2">
            {kids.map((k) => (
              <ItemCard key={k.id} item={k} />
            ))}
          </div>
        )}
      </section>

      {/* history — collapsed by default, nobody needs a wall of +1s on open */}
      {history.length > 0 && (
        <section className="mb-6">
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="pressable flex w-full items-center justify-between text-xs font-medium uppercase tracking-wide text-ink-3 mb-2"
          >
            <span>History ({history.length})</span>
            <span>{showHistory ? "hide" : "show"}</span>
          </button>
          {showHistory && (
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
          )}
        </section>
      )}

      {/* actions */}
      <div className="flex flex-wrap gap-2 border-t border-line-soft pt-4">
        {item.status === "active" ? (
          isHabit ? (
            <Button small variant="ghost" onClick={() => setConfirmRetire(true)}>
              {item.kind === "routine" ? "Retire routine" : "Retire habit"}
            </Button>
          ) : (
            <Button small variant="soft" onClick={() => completeItem(item.id)}>Mark complete</Button>
          )
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
        parent={crumbs.length ? crumbs[crumbs.length - 1] : null}
        onSave={(patch) => updateItem(item.id, patch)}
      />

      <Sheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Let this go?"
        cancelLabel="Keep"
        primary={{
          label: "Delete",
          danger: true,
          onClick: () => {
            const dest = crumbs.length ? `/item/${crumbs[crumbs.length - 1].id}` : area ? `/life/${area.id}` : "/life";
            deleteItem(item.id);
            // replace, not push — this item's URL is now dead, so a later
            // "back" (BackLink) must skip straight past it, not land on it
            router.replace(dest);
          },
        }}
      >
        <p className="text-sm text-ink-2 leading-relaxed">
          “{item.title}” will be removed.
          {kids.length > 0 && ` The ${kids.length} things inside move up a level. They aren't lost.`}
        </p>
      </Sheet>

      {isHabit && (
        <Sheet
          open={confirmRetire}
          onClose={() => setConfirmRetire(false)}
          title={item.kind === "routine" ? "Retire this routine?" : "Retire this habit?"}
          cancelLabel="Keep going"
          primary={{
            label: item.kind === "routine" ? "Retire routine" : "Retire habit",
            danger: true,
            onClick: () => { completeItem(item.id); setConfirmRetire(false); },
          }}
        >
          <p className="text-sm text-ink-2 leading-relaxed">
            “{item.title}” will stop appearing on Today and its streak ends here. This is
            different from logging today: if you just did it today, close this and use
            “Done today” instead. You can bring the habit back anytime with Reopen.
          </p>
        </Sheet>
      )}
    </div>
  );
}

function DragDots() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
      <circle cx="4" cy="3" r="1.3" /><circle cx="10" cy="3" r="1.3" />
      <circle cx="4" cy="7" r="1.3" /><circle cx="10" cy="7" r="1.3" />
      <circle cx="4" cy="11" r="1.3" /><circle cx="10" cy="11" r="1.3" />
    </svg>
  );
}

/* ————— a routine's steps: its ordered script, each optionally timed ————— */

function RoutineStepsEditor({ item }: { item: Item }) {
  const { updateItem } = useLife();
  const steps = item.steps ?? [];
  const [newTitle, setNewTitle] = useState("");
  const [newMinutes, setNewMinutes] = useState("");
  const total = routineMinutes(item);

  const save = (next: RoutineStep[]) => updateItem(item.id, { steps: next });

  const parseMin = (v: string): number | null => {
    const m = parseFloat(v);
    return Number.isFinite(m) && m > 0 ? Math.min(1440, Math.round(m)) : null;
  };

  const add = () => {
    if (!newTitle.trim()) return;
    save([...steps, { id: uid(), title: newTitle.trim(), minutes: parseMin(newMinutes) }]);
    setNewTitle("");
    setNewMinutes("");
  };

  // rows sit flush (divide-y), so no gap in the rebase offset
  const { order, draggingId, rowRef, handleProps } = useRowDrag(
    steps.map((s) => s.id),
    (ids) => save(ids.map((sid) => steps.find((s) => s.id === sid)).filter((s): s is RoutineStep => !!s))
  );

  return (
    <section className="mb-6">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-3">
        The script
        {steps.length > 0 && ` · ${steps.length} step${steps.length === 1 ? "" : "s"}`}
        {total != null && ` · ${total} min`}
      </p>

      {steps.length > 0 && (
        <div className="mb-2 divide-y divide-line-soft rounded-(--radius-card) border border-line-soft bg-surface shadow-(--shadow-card)">
          {order.map((id, i) => {
            const s = steps.find((x) => x.id === id);
            if (!s) return null;
            return (
            <div
              key={s.id}
              ref={rowRef(s.id)}
              className={`relative flex items-center gap-2 bg-surface px-3 py-2 ${draggingId === s.id ? "z-20 shadow-(--shadow-float)" : ""}`}
            >
              {/* the order IS the routine — drag a step where it belongs */}
              <button
                {...handleProps(s.id)}
                aria-label={`Drag step ${i + 1} to reorder`}
                className="shrink-0 touch-none cursor-grab px-1 text-ink-3 active:cursor-grabbing"
              >
                <DragDots />
              </button>
              {/* commit on blur, not per keystroke — every save syncs to the cloud */}
              <input
                defaultValue={s.title}
                onBlur={(e) => {
                  const t = e.target.value.trim();
                  if (t && t !== s.title) save(steps.map((x) => (x.id === s.id ? { ...x, title: t } : x)));
                  else e.target.value = s.title;
                }}
                aria-label={`Step ${i + 1} title`}
                className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none"
              />
              <input
                type="number"
                min={1}
                defaultValue={s.minutes ?? ""}
                onBlur={(e) => {
                  const m = parseMin(e.target.value);
                  if (m !== s.minutes) save(steps.map((x) => (x.id === s.id ? { ...x, minutes: m } : x)));
                }}
                placeholder="–"
                aria-label={`Step ${i + 1} minutes`}
                className="w-14 shrink-0 rounded-lg border border-line bg-bg px-2 py-1 text-right text-sm text-ink tabular-nums outline-none focus:border-accent"
              />
              <span className="shrink-0 text-xs text-ink-3">min</span>
              <button
                onClick={() => save(steps.filter((x) => x.id !== s.id))}
                aria-label="Remove step"
                className="pressable shrink-0 px-1 text-ink-3 hover:text-danger"
              >
                ×
              </button>
            </div>
            );
          })}
        </div>
      )}

      <div className="flex gap-2">
        <input
          className={inputCls}
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder={steps.length === 0 ? 'e.g. "Wash face"' : "Next step…"}
        />
        <input
          type="number"
          min={1}
          value={newMinutes}
          onChange={(e) => setNewMinutes(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="min"
          aria-label="Minutes for the new step"
          className="w-20 shrink-0 rounded-xl border border-line bg-bg px-3 py-2.5 text-sm text-ink tabular-nums outline-none focus:border-accent"
        />
        <Button small onClick={add} disabled={!newTitle.trim()}>Add</Button>
      </div>
      <p className="mt-2 text-xs text-ink-3">
        Steps are this routine&rsquo;s script — on Today it stays one single entry.
        {total != null && ` The minutes add up to ${total}, which the focus timer suggests when you run it.`}
      </p>
    </section>
  );
}

/* ————— a list's contents: tick, quantify, rearrange ————— */

function ListEntriesEditor({ item }: { item: Item }) {
  const { updateItem } = useLife();
  const entries = item.entries ?? [];
  const [newText, setNewText] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const doneCount = entries.filter((e) => e.done).length;
  const totals = listTotals(entries);

  const save = (next: ListEntry[]) => updateItem(item.id, { entries: next });

  const parseAmt = (v: string): number | null => {
    const a = parseFloat(v);
    return Number.isFinite(a) && a > 0 ? a : null;
  };

  const add = () => {
    if (!newText.trim()) return;
    save([...entries, {
      id: uid(), text: newText.trim(), amount: parseAmt(newAmount),
      unit: newUnit.trim() || null, done: false,
    }]);
    setNewText("");
    setNewAmount("");
    setNewUnit("");
  };

  const { order, draggingId, rowRef, handleProps } = useRowDrag(
    entries.map((e) => e.id),
    (ids) => save(ids.map((eid) => entries.find((e) => e.id === eid)).filter((e): e is ListEntry => !!e))
  );

  return (
    <section className="mb-6">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-3">
        The list
        {entries.length > 0 && ` · ${doneCount}/${entries.length} done`}
        {totals && ` · ${totals}`}
      </p>

      {entries.length > 0 && (
        <div className="mb-2 divide-y divide-line-soft rounded-(--radius-card) border border-line-soft bg-surface shadow-(--shadow-card)">
          {order.map((id, i) => {
            const e = entries.find((x) => x.id === id);
            if (!e) return null;
            return (
            <div
              key={e.id}
              ref={rowRef(e.id)}
              className={`relative flex items-center gap-2 bg-surface px-3 py-2 ${draggingId === e.id ? "z-20 shadow-(--shadow-float)" : ""}`}
            >
              <button
                {...handleProps(e.id)}
                aria-label={`Drag entry ${i + 1} to reorder`}
                className="shrink-0 touch-none cursor-grab px-1 text-ink-3 active:cursor-grabbing"
              >
                <DragDots />
              </button>
              <button
                onClick={() => save(entries.map((x) => (x.id === e.id ? { ...x, done: !x.done } : x)))}
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
              {/* commit on blur, not per keystroke — every save syncs to the cloud */}
              <input
                defaultValue={e.text}
                onBlur={(ev) => {
                  const t = ev.target.value.trim();
                  if (t && t !== e.text) save(entries.map((x) => (x.id === e.id ? { ...x, text: t } : x)));
                  else ev.target.value = e.text;
                }}
                aria-label={`Entry ${i + 1} text`}
                className={`min-w-0 flex-1 bg-transparent text-sm outline-none ${
                  e.done ? "text-ink-3 line-through decoration-ink-3/40" : "text-ink"
                }`}
              />
              <input
                type="number"
                min={0}
                step="any"
                defaultValue={e.amount ?? ""}
                onBlur={(ev) => {
                  const a = parseAmt(ev.target.value);
                  if (a !== e.amount) save(entries.map((x) => (x.id === e.id ? { ...x, amount: a } : x)));
                }}
                placeholder="–"
                aria-label={`Entry ${i + 1} amount`}
                className="w-16 shrink-0 rounded-lg border border-line bg-bg px-2 py-1 text-right text-sm text-ink tabular-nums outline-none focus:border-accent"
              />
              <input
                defaultValue={e.unit ?? ""}
                onBlur={(ev) => {
                  const u = ev.target.value.trim() || null;
                  if (u !== e.unit) save(entries.map((x) => (x.id === e.id ? { ...x, unit: u } : x)));
                }}
                placeholder="unit"
                aria-label={`Entry ${i + 1} unit`}
                className="w-14 shrink-0 rounded-lg border border-line bg-bg px-2 py-1 text-sm text-ink outline-none focus:border-accent"
              />
              <button
                onClick={() => save(entries.filter((x) => x.id !== e.id))}
                aria-label="Remove entry"
                className="pressable shrink-0 px-1 text-ink-3 hover:text-danger"
              >
                ×
              </button>
            </div>
            );
          })}
        </div>
      )}

      <div className="flex gap-2">
        <input
          className={inputCls}
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder={entries.length === 0 ? 'e.g. "Milk"' : "Next entry…"}
        />
        <input
          type="number"
          min={0}
          step="any"
          value={newAmount}
          onChange={(e) => setNewAmount(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="amt"
          aria-label="Amount for the new entry"
          className="w-20 shrink-0 rounded-xl border border-line bg-bg px-3 py-2.5 text-sm text-ink tabular-nums outline-none focus:border-accent"
        />
        <input
          value={newUnit}
          onChange={(e) => setNewUnit(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="unit"
          aria-label="Unit for the new entry"
          className="w-16 shrink-0 rounded-xl border border-line bg-bg px-3 py-2.5 text-sm text-ink outline-none focus:border-accent"
        />
        <Button small onClick={add} disabled={!newText.trim()}>Add</Button>
      </div>
      <p className="mt-2 text-xs text-ink-3">
        Entries stay ticked once done — a list keeps its history, unlike a routine&rsquo;s daily reset.
        {totals && ` Everything quantified adds up to ${totals}.`}
      </p>
    </section>
  );
}

/* ————— a routine's hours: when it sits on the Today list ————— */

const WINDOW_PRESETS: { label: string; start: string | null; end: string | null }[] = [
  { label: "🌄 Morning", start: "05:00", end: "12:00" },
  { label: "🌤 Afternoon", start: "12:00", end: "17:00" },
  { label: "🌙 Night", start: "21:00", end: "02:00" },
  { label: "All day", start: null, end: null },
];

function RoutineWindowEditor({ item }: { item: Item }) {
  const { updateItem } = useLife();
  const set = (start: string | null, end: string | null) =>
    updateItem(item.id, { windowStart: start, windowEnd: end });

  return (
    <section className="mb-6">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-3">Visible hours</p>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {WINDOW_PRESETS.map((p) => (
          <Chip
            key={p.label}
            active={item.windowStart === p.start && item.windowEnd === p.end}
            onClick={() => set(p.start, p.end)}
          >
            {p.label}
          </Chip>
        ))}
      </div>
      <div className="flex items-center gap-2 text-sm text-ink-2">
        <input
          type="time"
          value={item.windowStart ?? ""}
          onChange={(e) => set(e.target.value || null, item.windowEnd)}
          aria-label="Visible from"
          className="rounded-lg border border-line bg-bg px-2 py-1.5 text-sm text-ink tabular-nums outline-none focus:border-accent"
        />
        <span className="text-ink-3">to</span>
        <input
          type="time"
          value={item.windowEnd ?? ""}
          onChange={(e) => set(item.windowStart, e.target.value || null)}
          aria-label="Visible until"
          className="rounded-lg border border-line bg-bg px-2 py-1.5 text-sm text-ink tabular-nums outline-none focus:border-accent"
        />
      </div>
      <p className="mt-2 text-xs text-ink-3 leading-relaxed">
        Inside these hours the routine sits on Today; outside them it waits under
        &ldquo;Out of hours&rdquo; instead of staring at you. An end before the start is fine —
        9:00 pm to 2:00 am wraps past midnight. Left empty, it shows all day.
      </p>
    </section>
  );
}

/** Log today's occurrence, kept distinct from retiring the habit for good. */
function HabitTodayControl({
  item, onToggle,
}: { item: Item; onToggle: (item: Item, day: string, currentlyDone: boolean) => void }) {
  const { db } = useLife();
  // a night routine ticked before ~4 am belongs to yesterday's evening
  const day = routineLogDay(item);
  const dayTarget = habitDailyTarget(item);
  const dayValue = dayLogged(db.logs, item.id, day);
  const done = dayValue >= dayTarget;
  const multi = dayTarget > 1;

  return (
    <div className="flex items-center justify-between gap-4 rounded-(--radius-card) border border-line-soft bg-surface p-4 shadow-(--shadow-card)">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">
          {done ? "Done today ✓" : multi ? `${dayValue}/${dayTarget} today` : "Not done today"}
        </p>
        {day !== today() && (
          <p className="mt-0.5 text-xs text-accent-deep">
            🌙 counts for the night of {shortDay(day)} until 4 am
          </p>
        )}
        {multi && (
          <div className="mt-1.5">
            <Bar value={dayValue / dayTarget} height={5} />
          </div>
        )}
      </div>
      <Button small variant={done ? "soft" : "primary"} onClick={() => onToggle(item, day, done)}>
        {done ? "Undo" : multi ? "Log one" : "Mark done today"}
      </Button>
    </div>
  );
}

/* ————— Move: reorganize your life anytime ————— */

/** Kinds that usually hold other things — they lead the parent list. */
const PARENT_FIRST_KINDS = ["goal", "project", "milestone", "habit", "book"];

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
  // everything is staged: nothing moves until "Move" is pressed, so Cancel
  // really cancels — no more instant, unrevertable area hops
  const [areaId, setAreaId] = useState<string | null>(item.areaId);
  const [parentId, setParentId] = useState<string | null>(item.parentId);

  // fresh staging every time the sheet opens for an item
  const [lastKey, setLastKey] = useState("");
  const key = `${open}:${item.id}`;
  if (key !== lastKey) {
    setLastKey(key);
    setAreaId(item.areaId);
    setParentId(item.parentId);
    setSearch("");
  }

  // an item can't be nested inside itself or its own descendants
  const forbidden = useMemo(() => {
    const set = new Set(descendants(db, item.id).map((d) => d.id));
    set.add(item.id);
    return set;
  }, [db, item.id]);

  // every possible parent, scrollable — goals and projects first, then the
  // rest; the chosen area's things float up within each group
  const q = search.trim().toLowerCase();
  const candidates = useMemo(() => {
    const rank = (x: Item) =>
      (PARENT_FIRST_KINDS.includes(x.kind) ? 0 : 2) + (areaId && x.areaId === areaId ? 0 : 1);
    return db.items
      .filter((i) => !forbidden.has(i.id) && i.status !== "archived" && (!q || i.title.toLowerCase().includes(q)))
      .sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title));
  }, [db.items, forbidden, q, areaId]);

  const pendingParent = parentId ? db.items.find((i) => i.id === parentId) ?? null : null;
  const dirty = areaId !== item.areaId || parentId !== item.parentId;

  const pickParent = (cand: Item) => {
    if (parentId === cand.id) {
      setParentId(null); // tap again to unpick
      return;
    }
    setParentId(cand.id);
    // living inside something means living where it lives — adopt the
    // parent's area (the chips above can still override before saving)
    if (cand.areaId) setAreaId(cand.areaId);
  };

  const save = () => {
    onMove(item.id, { areaId, parentId });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Move"
      cancelLabel="Cancel"
      primary={{ label: "Move", onClick: save }}
      primaryDisabled={!dirty}
    >
      <Field label="Life area">
        <div className="flex flex-wrap gap-1.5">
          <Chip active={areaId === null} onClick={() => setAreaId(null)}>None</Chip>
          {[...db.areas].sort((a, b) => a.position - b.position).map((a) => (
            <Chip key={a.id} active={areaId === a.id} onClick={() => setAreaId(a.id)}>
              {a.emoji} {a.name}
            </Chip>
          ))}
        </div>
      </Field>

      <Field label="Lives inside">
        {pendingParent ? (
          <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-accent bg-accent-soft px-3.5 py-2.5">
            <span className="min-w-0 truncate text-sm text-ink">
              <KindIcon kind={pendingParent.kind} /> {pendingParent.title}
            </span>
            <button className="shrink-0 text-xs font-medium text-ink-3 hover:text-ink" onClick={() => setParentId(null)}>
              make top level
            </button>
          </div>
        ) : (
          <p className="mb-2 text-sm text-ink-3">Top level — it belongs to no bigger thing.</p>
        )}
        <input
          className={inputCls}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search everything you have…"
        />
        <div className="mt-2 max-h-72 space-y-1.5 overflow-y-auto pr-1">
          {candidates.map((cand) => {
            const candArea = cand.areaId ? db.areas.find((a) => a.id === cand.areaId) : null;
            const horizonLabel = HORIZON_META.find((h) => h.value === cand.horizon)?.label;
            const active = parentId === cand.id;
            return (
              <button
                key={cand.id}
                onClick={() => pickParent(cand)}
                className={`pressable block w-full rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
                  active ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-accent"
                }`}
              >
                <span className="flex min-w-0 items-center gap-1.5 text-sm text-ink">
                  <KindIcon kind={cand.kind} className="shrink-0" />
                  <span className="min-w-0 truncate">{cand.title}</span>
                </span>
                {(candArea || horizonLabel) && (
                  <span className="mt-0.5 flex gap-2 text-xs text-ink-3">
                    {candArea && <span>{candArea.emoji} {candArea.name}</span>}
                    {horizonLabel && <span>{horizonLabel}</span>}
                  </span>
                )}
              </button>
            );
          })}
          {candidates.length === 0 && <p className="text-sm text-ink-3">Nothing matches.</p>}
        </div>
        <p className="mt-2 text-xs text-ink-3">
          Everything you have is listed. Nothing moves until you press Move.
        </p>
      </Field>
    </Sheet>
  );
}

/* ————— Schedule & horizon ————— */

const PERIOD_HORIZONS: Horizon[] = ["week", "month", "quarter", "year"];
const isPeriodHorizon = (h: Horizon): h is Period => (PERIOD_HORIZONS as string[]).includes(h ?? "");

function ScheduleSheet({
  open, onClose, item, parent, onSave,
}: {
  open: boolean;
  onClose: () => void;
  item: Item;
  /** immediate parent, if nested — bounds the period stepper below so a
   *  weekly goal under a monthly one only steps through that month's weeks */
  parent: Item | null;
  onSave: (patch: Partial<Item>) => void;
}) {
  const parentRange = useMemo(() => {
    if (!isPeriodHorizon(item.horizon)) return null;
    return boundingRange(item.horizon, parent?.horizon ?? null, parent?.horizonPeriod ?? null);
  }, [item.horizon, parent]);

  const stepPrevDisabled = Boolean(
    parentRange && isPeriodHorizon(item.horizon) &&
    previousAnchor(item.horizon, item.horizonPeriod ?? today()) < parentRange.start
  );
  const stepNextDisabled = Boolean(
    parentRange && isPeriodHorizon(item.horizon) &&
    nextAnchor(item.horizon, item.horizonPeriod ?? today()) > parentRange.end
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="When?"
      cancelLabel="Close"
      primary={{ label: "Done", onClick: onClose }}
    >
      <Field label="Planning horizon">
        <div className="flex flex-wrap gap-1.5">
          <Chip active={item.horizon === null} onClick={() => onSave({ horizon: null, horizonPeriod: null })}>None</Chip>
          {HORIZON_META.map((h) => (
            <Chip
              key={h.value}
              active={item.horizon === h.value}
              onClick={() => {
                let horizonPeriod: string | null = null;
                if (isPeriodHorizon(h.value)) {
                  if (item.horizon === h.value && item.horizonPeriod) {
                    // keep the existing anchor when re-confirming the same
                    // horizon; otherwise land on "now" (bounded to the
                    // parent's own window, if nested) — adjust with the
                    // stepper below
                    horizonPeriod = item.horizonPeriod;
                  } else {
                    const range = boundingRange(h.value, parent?.horizon ?? null, parent?.horizonPeriod ?? null);
                    horizonPeriod = range ? firstAnchorWithin(range) : today();
                  }
                } else if (h.value === "date") {
                  // keep an already-picked date when re-confirming; otherwise
                  // start on today's date in the calendar grid below
                  horizonPeriod = item.horizon === "date" && item.horizonPeriod ? item.horizonPeriod : today();
                }
                onSave({
                  horizon: h.value,
                  horizonPeriod,
                  // "Today" and a repeat never coexist: a repeat reaches Today
                  // by itself, and its checkbox logs a day instead of
                  // completing the item — keeping both would silently change
                  // what checking it off means
                  ...(h.value === "today" && item.cadence !== null
                    ? { cadence: null, cadenceDays: null, cadenceCount: null }
                    : {}),
                  // this picker only ever labels a timeframe; shelving (status)
                  // stays a separate, deliberate action via the Someday/Make
                  // active buttons — otherwise a cadence on a "someday" item
                  // would silently stop appearing on Today
                  ...(item.status === "someday" && h.value !== "someday" ? { status: "active" as const } : {}),
                });
              }}
            >
              {h.label}
            </Chip>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-3">
          The same thing moves through time: someday → year → month → week → today.
        </p>
        {isPeriodHorizon(item.horizon) && (
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => onSave({ horizonPeriod: previousAnchor(item.horizon as Period, item.horizonPeriod ?? today()) })}
              disabled={stepPrevDisabled}
              aria-label={`Previous ${item.horizon}`}
              className="pressable grid h-8 w-8 place-items-center rounded-lg border border-line text-ink-3 hover:bg-surface-2 disabled:opacity-30 disabled:pointer-events-none"
            >
              ‹
            </button>
            <span className="flex-1 text-center text-sm font-medium text-ink">
              {prettyPeriod(item.horizon as Period, item.horizonPeriod ?? today())}
            </span>
            <button
              onClick={() => onSave({ horizonPeriod: nextAnchor(item.horizon as Period, item.horizonPeriod ?? today()) })}
              disabled={stepNextDisabled}
              aria-label={`Next ${item.horizon}`}
              className="pressable grid h-8 w-8 place-items-center rounded-lg border border-line text-ink-3 hover:bg-surface-2 disabled:opacity-30 disabled:pointer-events-none"
            >
              ›
            </button>
          </div>
        )}
        {parentRange && parent && (
          <p className="mt-1.5 text-xs text-ink-3">
            Kept inside {parent.title}&rsquo;s {HORIZON_META.find((h) => h.value === parent.horizon)?.label.toLowerCase()}.
          </p>
        )}
        {item.horizon === "date" && (
          <div className="mt-3 space-y-2.5">
            <DateGridPicker
              value={item.horizonPeriod ?? today()}
              onChange={(day) => onSave({ horizonPeriod: day })}
            />
            <div className="flex items-center justify-between">
              <p className="text-sm text-ink">
                {prettyDay(item.horizonPeriod ?? today())}
                {!item.dateRepeatsYearly && `, ${(item.horizonPeriod ?? today()).slice(0, 4)}`}
              </p>
              <Chip
                active={item.dateRepeatsYearly}
                onClick={() => onSave({ dateRepeatsYearly: !item.dateRepeatsYearly })}
              >
                Repeats every year
              </Chip>
            </div>
          </div>
        )}
      </Field>

      <Field label="Repeats">
        <ScheduleEditor
          value={{ cadence: item.cadence, cadenceDays: item.cadenceDays, cadenceCount: item.cadenceCount }}
          onChange={(v) =>
            onSave({
              cadence: v.cadence,
              cadenceDays: v.cadence === "days" ? v.cadenceDays : null,
              cadenceCount: v.cadence === "weekly" ? v.cadenceCount : null,
              // mirror of the Today chip above: a repeat takes over the
              // "Today" marker — it puts this on Today by itself from now on
              ...(v.cadence !== null && item.horizon === "today"
                ? { horizon: null as Horizon, horizonPeriod: null }
                : {}),
            })
          }
        />
        {item.cadence !== null && (
          <p className="mt-1.5 text-xs text-ink-3">
            This appears on Today by itself. Checking it off there logs that day —
            it never closes the whole thing.
          </p>
        )}
      </Field>

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
