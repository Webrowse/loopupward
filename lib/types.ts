/**
 * LoopUpward domain model.
 *
 * Everything a user captures starts as a Seed. A seed can become an Item —
 * the universal node: note, quote, goal, habit, book, money target, project…
 * Items nest without limit (parentId) and progress flows upward.
 */

export type ItemKind =
  | "note"
  | "quote"
  | "idea"
  | "dream"
  | "goal"
  | "habit"
  | "project"
  | "book"
  | "milestone"
  | "principle"
  | "promise"
  | "lesson"
  | "memory";

export type TrackerType =
  | "none" // just exists (note, quote…) or measured by its children
  | "check" // done / not done
  | "counter" // 132 / 200 workouts
  | "percent" // 45% of course
  | "money" // ₹25,000 / ₹100,000
  | "habit" // streak-based, logged per day
  | "book"; // chapter 7 / 20

export type ItemStatus = "active" | "done" | "someday" | "archived";

/** Planning horizon — the same node moves through time: someday → year → … → today. */
export type Horizon = "someday" | "life" | "year" | "quarter" | "month" | "week" | "today" | null;

export const HORIZON_META: { value: Exclude<Horizon, null>; label: string }[] = [
  { value: "someday", label: "Someday" },
  { value: "year", label: "This year" },
  { value: "quarter", label: "This quarter" },
  { value: "month", label: "This month" },
  { value: "week", label: "This week" },
  { value: "today", label: "Today" },
];

/**
 * When an item appears on Today:
 * - daily      every day (“20 pushups every day”)
 * - weekdays   Monday–Friday
 * - days       specific weekdays via cadenceDays (“French Mon/Wed/Fri”)
 * - weekly     cadenceCount times per week (“exercise 4× a week”)
 * - monthly    once a month (“pay bills”)
 */
export type Cadence = "daily" | "weekdays" | "days" | "weekly" | "monthly" | null;

export interface Area {
  id: string;
  name: string;
  emoji: string;
  color: string; // key into AREA_COLORS
  position: number;
  createdAt: number;
}

export interface Item {
  id: string;
  areaId: string | null;
  parentId: string | null;
  kind: ItemKind;
  tracker: TrackerType;
  title: string;
  note: string;
  /** tracker target: 200 workouts, 100000 money, 20 chapters, 100 percent */
  target: number | null;
  /** tracker current value */
  current: number;
  /** display unit: "₹", "$", "pages", "chapters", "times", "km" … */
  unit: string | null;
  horizon: Horizon;
  status: ItemStatus;
  /** schedule — anything with a cadence appears on Today automatically */
  cadence: Cadence;
  /** for cadence "days": weekday numbers as in Date.getDay() (0 = Sunday) */
  cadenceDays: number[] | null;
  /** for cadence "weekly": how many times per week */
  cadenceCount: number | null;
  pinned: boolean;
  position: number;
  createdAt: number;
  completedAt: number | null;
}

/** A quick capture. Lives in the inbox until planted into the system. */
export interface Seed {
  id: string;
  text: string;
  createdAt: number;
  /** set when converted into an item */
  itemId: string | null;
  archivedAt: number | null;
}

/** One concrete thing to do on a given day. The Today view is made of these. */
export interface Action {
  id: string;
  itemId: string | null;
  title: string;
  /** ISO date YYYY-MM-DD this action belongs to */
  date: string;
  done: boolean;
  doneAt: number | null;
  /** how much completing this adds to the linked item's `current` */
  amount: number;
  createdAt: number;
}

/** Progress event: habit day logged, counter bumped, money updated… */
export interface Log {
  id: string;
  itemId: string;
  /** ISO date YYYY-MM-DD */
  date: string;
  /** "add": delta on current. "set": current snapshot (money, percent). */
  op: "add" | "set";
  value: number;
  createdAt: number;
}

/** Free-text reflection attached to a review period. */
export interface Reflection {
  id: string;
  period: "week" | "month" | "quarter" | "year";
  /** e.g. 2026-W27 / 2026-07 / 2026-Q3 / 2026 */
  periodKey: string;
  text: string;
  createdAt: number;
  updatedAt: number;
}

export interface DB {
  areas: Area[];
  items: Item[];
  seeds: Seed[];
  actions: Action[];
  logs: Log[];
  reflections: Reflection[];
}

export const EMPTY_DB: DB = {
  areas: [],
  items: [],
  seeds: [],
  actions: [],
  logs: [],
  reflections: [],
};

export type TableName = keyof DB;

export interface Profile {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: "user" | "owner";
  premiumUntil: string | null; // ISO timestamp; far future = lifetime
  plan: string | null;
  createdAt: string;
}

export const KIND_META: Record<ItemKind, { label: string; emoji: string }> = {
  note: { label: "Note", emoji: "📝" },
  quote: { label: "Quote", emoji: "❝" },
  idea: { label: "Idea", emoji: "💡" },
  dream: { label: "Dream", emoji: "🌅" },
  goal: { label: "Goal", emoji: "🎯" },
  habit: { label: "Habit", emoji: "🔁" },
  project: { label: "Project", emoji: "🧩" },
  book: { label: "Book", emoji: "📖" },
  milestone: { label: "Milestone", emoji: "🏔" },
  principle: { label: "Principle", emoji: "🧭" },
  promise: { label: "Promise", emoji: "🤝" },
  lesson: { label: "Lesson", emoji: "🌱" },
  memory: { label: "Memory", emoji: "🫙" },
};

/** Kinds that live in the Personal Space rather than needing execution. */
export const SPACE_KINDS: ItemKind[] = [
  "quote",
  "principle",
  "promise",
  "lesson",
  "memory",
  "idea",
  "dream",
];
