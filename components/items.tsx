"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLife } from "@/lib/data/provider";
import { Item, ItemKind, KIND_META, TrackerType } from "@/lib/types";
import { children as childrenOf, formatValue, itemProgress, ownProgress, habitDays, currentStreak } from "@/lib/progress";
import { areaColor } from "@/lib/palette";
import { Bar } from "./progress";
import { Button, Chip, Field, Sheet, inputCls } from "./ui";

/* ————— Item card ————— */

export function ItemCard({ item }: { item: Item }) {
  const { db, theme } = useLife();
  const router = useRouter();
  const progress = itemProgress(db, item);
  const kids = childrenOf(db, item.id);
  const area = db.areas.find((a) => a.id === item.areaId);
  const c = areaColor(area?.color);
  const color = theme === "dark" ? c.fgDark : c.fg;
  const streak =
    item.kind === "habit" ? currentStreak(habitDays(db.logs, item.id)) : 0;

  return (
    <button
      onClick={() => router.push(`/item/${item.id}`)}
      className="pressable block w-full text-left bg-surface rounded-(--radius-card) border border-line-soft shadow-(--shadow-card) px-4 py-3.5"
    >
      <div className="flex items-start gap-3">
        <span className="text-lg leading-6 shrink-0">{KIND_META[item.kind].emoji}</span>
        <div className="min-w-0 flex-1">
          <div className={`text-[0.95rem] font-medium leading-snug ${item.status === "done" ? "text-ink-3 line-through decoration-ink-3/50" : "text-ink"}`}>
            {item.title}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-ink-3">
            {area && (
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                {area.name}
              </span>
            )}
            {kids.length > 0 && <span>{kids.length} inside</span>}
            {item.kind === "habit" && streak > 0 && (
              <span className="text-amber font-medium">{streak} day streak</span>
            )}
            {trackerCaption(item)}
          </div>
        </div>
        {progress !== null && item.tracker !== "habit" && (
          <span className="shrink-0 text-xs font-medium text-ink-2 tabular-nums pt-1">
            {Math.round(progress * 100)}%
          </span>
        )}
      </div>
      {progress !== null && item.status !== "done" && (
        <div className="mt-2.5 pl-8">
          <Bar value={progress} color={color} height={6} />
        </div>
      )}
    </button>
  );
}

function trackerCaption(item: Item) {
  if (item.tracker === "counter" || item.tracker === "book" || item.tracker === "money") {
    return (
      <span className="tabular-nums">
        {formatValue(item, item.current)}
        {item.target != null && ` / ${formatValue(item, item.target)}`}
      </span>
    );
  }
  if (item.tracker === "percent") return <span className="tabular-nums">{Math.round(item.current)}%</span>;
  return null;
}

/* ————— Tracker controls (item page) ————— */

export function TrackerControls({ item }: { item: Item }) {
  const { bumpTracker, setTracker } = useLife();
  const [editValue, setEditValue] = useState<string | null>(null);

  if (item.tracker === "none" || item.tracker === "check" || item.tracker === "habit") return null;

  const step = item.tracker === "money" ? Math.max(1, Math.round((item.target ?? 1000) / 100)) : 1;

  return (
    <div className="flex items-center gap-3">
      <Button small variant="soft" onClick={() => bumpTracker(item, -step)}>−{step > 1 ? step.toLocaleString() : ""}</Button>
      {editValue === null ? (
        <button
          className="font-display text-2xl text-ink tabular-nums flex-1 text-center"
          onClick={() => setEditValue(String(item.current))}
        >
          {formatValue(item, item.current)}
          {item.target != null && (
            <span className="text-ink-3 text-lg"> / {formatValue(item, item.target)}</span>
          )}
        </button>
      ) : (
        <input
          autoFocus
          type="number"
          className={`${inputCls} text-center flex-1`}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => {
            const v = parseFloat(editValue);
            if (!Number.isNaN(v)) setTracker(item, v);
            setEditValue(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
      )}
      <Button small variant="soft" onClick={() => bumpTracker(item, step)}>+{step > 1 ? step.toLocaleString() : ""}</Button>
    </div>
  );
}

/* ————— Create / edit sheet ————— */

const TRACKER_OPTIONS: { value: TrackerType; label: string; hint: string }[] = [
  { value: "none", label: "Just exists", hint: "a note, a thought — or measured by what's inside it" },
  { value: "check", label: "Done / not done", hint: "one clear finish line" },
  { value: "counter", label: "Count", hint: "workout 200 times, read 20 books" },
  { value: "percent", label: "Percent", hint: "course 45% complete" },
  { value: "money", label: "Money", hint: "save toward an amount" },
  { value: "habit", label: "Daily habit", hint: "streaks, logged day by day" },
  { value: "book", label: "Book", hint: "chapter 7 of 20" },
];

const KIND_ORDER: ItemKind[] = [
  "goal", "habit", "project", "book", "dream", "idea", "note", "quote",
  "milestone", "principle", "promise", "lesson", "memory",
];

const KIND_DEFAULT_TRACKER: Partial<Record<ItemKind, TrackerType>> = {
  habit: "habit",
  book: "book",
  goal: "check",
  project: "none",
  milestone: "check",
};

export function ItemSheet({
  open, onClose, initial, editing, defaultAreaId, defaultParentId, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  /** prefill title (planting a seed) */
  initial?: string;
  /** item being edited, if any */
  editing?: Item | null;
  defaultAreaId?: string | null;
  defaultParentId?: string | null;
  onCreated?: (item: Item) => void;
}) {
  const { db, addItem, updateItem, limits } = useLife();
  const [title, setTitle] = useState(editing?.title ?? initial ?? "");
  const [kind, setKind] = useState<ItemKind>(editing?.kind ?? "goal");
  const [tracker, setTracker] = useState<TrackerType>(editing?.tracker ?? "check");
  const [areaId, setAreaId] = useState<string | null>(editing?.areaId ?? defaultAreaId ?? null);
  const [target, setTarget] = useState(editing?.target != null ? String(editing.target) : "");
  const [unit, setUnit] = useState(editing?.unit ?? "");
  const [note, setNote] = useState(editing?.note ?? "");
  const [touchedTracker, setTouchedTracker] = useState(Boolean(editing));

  // reset when reopened for a different subject
  const subject = `${open}:${editing?.id ?? ""}:${initial ?? ""}`;
  const [lastSubject, setLastSubject] = useState(subject);
  if (subject !== lastSubject) {
    setLastSubject(subject);
    setTitle(editing?.title ?? initial ?? "");
    setKind(editing?.kind ?? "goal");
    setTracker(editing?.tracker ?? "check");
    setAreaId(editing?.areaId ?? defaultAreaId ?? null);
    setTarget(editing?.target != null ? String(editing.target) : "");
    setUnit(editing?.unit ?? "");
    setNote(editing?.note ?? "");
    setTouchedTracker(Boolean(editing));
  }

  const pickKind = (k: ItemKind) => {
    setKind(k);
    if (!touchedTracker) setTracker(KIND_DEFAULT_TRACKER[k] ?? "none");
  };

  const needsTarget = ["counter", "money", "book", "percent"].includes(tracker);
  const canSave = title.trim().length > 0 && (editing ? true : limits.canAddItem);

  const save = () => {
    const t = target.trim() === "" ? (tracker === "percent" ? 100 : null) : parseFloat(target);
    const patch = {
      title: title.trim(),
      kind,
      tracker,
      areaId,
      target: Number.isNaN(t as number) ? null : t,
      unit: unit.trim() || (tracker === "money" ? "₹" : null),
      note,
    };
    if (editing) {
      updateItem(editing.id, patch);
    } else {
      const item = addItem({ ...patch, parentId: defaultParentId ?? null });
      if (item && onCreated) onCreated(item);
    }
    onClose();
  };

  const sortedAreas = useMemo(() => [...db.areas].sort((a, b) => a.position - b.position), [db.areas]);

  return (
    <Sheet open={open} onClose={onClose} title={editing ? "Edit" : "Give it a shape"}>
      <Field label="What is it?">
        <input
          className={inputCls}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Run a marathon"
          autoFocus={!initial}
        />
      </Field>

      <Field label="It's a…">
        <div className="flex flex-wrap gap-1.5">
          {KIND_ORDER.map((k) => (
            <Chip key={k} active={kind === k} onClick={() => pickKind(k)}>
              {KIND_META[k].emoji} {KIND_META[k].label}
            </Chip>
          ))}
        </div>
      </Field>

      <Field label="How do you want to track it?">
        <div className="space-y-1.5">
          {TRACKER_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => { setTracker(o.value); setTouchedTracker(true); }}
              className={`w-full text-left rounded-xl border px-3.5 py-2.5 transition-colors ${
                tracker === o.value ? "border-accent bg-accent-soft" : "border-line bg-surface"
              }`}
            >
              <span className="text-sm font-medium text-ink">{o.label}</span>
              <span className="block text-xs text-ink-3">{o.hint}</span>
            </button>
          ))}
        </div>
      </Field>

      {needsTarget && (
        <div className="grid grid-cols-2 gap-3">
          <Field label={tracker === "book" ? "Chapters" : tracker === "percent" ? "Target %" : "Target"}>
            <input
              className={inputCls}
              type="number"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder={tracker === "money" ? "100000" : tracker === "book" ? "20" : "200"}
            />
          </Field>
          <Field label="Unit">
            <input
              className={inputCls}
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder={tracker === "money" ? "₹" : tracker === "book" ? "chapters" : "times"}
            />
          </Field>
        </div>
      )}

      {sortedAreas.length > 0 && !defaultParentId && (
        <Field label="Life area">
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

      <Field label="Notes">
        <textarea
          className={`${inputCls} min-h-20 resize-none`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Why does this matter to you?"
        />
      </Field>

      {!editing && !limits.canAddItem && (
        <p className="text-sm text-amber mb-3">
          You&apos;ve reached the free plan&apos;s active items. Upgrade for unlimited.
        </p>
      )}

      <Button full onClick={save} disabled={!canSave}>
        {editing ? "Save" : "Plant it"}
      </Button>
    </Sheet>
  );
}

/* ————— small helpers shared by pages ————— */

export function ProgressCaption({ item }: { item: Item }) {
  const { db } = useLife();
  const p = itemProgress(db, item);
  const own = ownProgress(item);
  if (p === null) return null;
  return (
    <span className="text-xs text-ink-3 tabular-nums">
      {Math.round(p * 100)}%{own === null ? " · from what's inside" : ""}
    </span>
  );
}
