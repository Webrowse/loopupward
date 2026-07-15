/**
 * LoopUpward domain model.
 *
 * Everything a user captures starts as a Seed. A seed can become an Item —
 * the universal node: note, quote, goal, habit, book, money target, project…
 * Items nest without limit (parentId) and progress flows upward.
 */

export type ItemKind =
  | "note"
  | "folder"
  | "quote"
  | "idea"
  | "dream"
  | "goal"
  | "habit"
  | "routine"
  | "project"
  | "book"
  | "milestone"
  | "principle"
  | "promise"
  | "lesson"
  | "memory";

/** One step of a routine: "face wash — 5 minutes". Steps aren't separate
 *  todos — the routine is checked off as one thing; steps are its script,
 *  and their minutes sum into the routine's expected length. */
export interface RoutineStep {
  id: string;
  title: string;
  /** how long this step takes, in minutes — null when untimed */
  minutes: number | null;
}

export type TrackerType =
  | "none" // just exists (note, quote…) or measured by its children
  | "check" // done / not done
  | "counter" // 132 / 200 workouts
  | "percent" // 45% of course
  | "money" // ₹25,000 / ₹100,000
  | "habit" // streak-based, logged per day
  | "book"; // chapter 7 / 20

export type ItemStatus = "active" | "done" | "someday" | "archived";

/** Planning horizon — the same node moves through time: someday → year → … → today.
 *  "date" stands apart from that progression: it pins the item to one exact
 *  calendar day (an appointment, a birthday) rather than a fuzzy bucket. */
export type Horizon = "someday" | "life" | "year" | "quarter" | "month" | "week" | "today" | "date" | null;

export const HORIZON_META: { value: Exclude<Horizon, null>; label: string }[] = [
  { value: "someday", label: "Someday" },
  { value: "year", label: "This year" },
  { value: "quarter", label: "This quarter" },
  { value: "month", label: "This month" },
  { value: "week", label: "This week" },
  { value: "today", label: "Today" },
  { value: "date", label: "Exact date" },
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
  /** any day (YYYY-MM-DD) inside the specific week/month/quarter/year
   *  instance this horizon points at — compare via dates.periodKey(horizon,
   *  this). Null for someday/today/none, or items not yet anchored.
   *  For horizon "date" this is the exact pinned day instead (this year's
   *  occurrence, when dateRepeatsYearly is set). */
  horizonPeriod: string | null;
  /** horizon "date" only: resurface every year on horizonPeriod's month/day
   *  (a birthday) instead of once (a one-off appointment). */
  dateRepeatsYearly: boolean;
  /** rich (HTML) content for note-kind items — the notes app's editor body.
   *  Separate from `note` above, which stays a plain-text annotation. */
  richBody: string | null;
  status: ItemStatus;
  /** schedule — anything with a cadence appears on Today automatically */
  cadence: Cadence;
  /** for cadence "days": weekday numbers as in Date.getDay() (0 = Sunday) */
  cadenceDays: number[] | null;
  /** for cadence "weekly": how many times per week */
  cadenceCount: number | null;
  /** routine kind only: the ordered script of the routine (see RoutineStep) */
  steps: RoutineStep[] | null;
  /** user-created label ids (labels are tags, independent of areas) */
  labels: string[];
  pinned: boolean;
  position: number;
  createdAt: number;
  completedAt: number | null;
  /** set when moved to trash; item is hidden from normal views but kept
   *  around for recovery until the retention window purges it for good. */
  deletedAt: number | null;
}

/** A quick capture. Personal thoughts never vanish silently:
 *  inbox → later (resting) → archived (kept, hidden) → deleted only with confirmation. */
export type SeedStatus = "inbox" | "later" | "archived";

export interface Seed {
  id: string;
  text: string;
  createdAt: number;
  /** set when converted into an item */
  itemId: string | null;
  archivedAt: number | null;
  status: SeedStatus;
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
  /** 0 = normal, 1 = high */
  priority: number;
  note: string;
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

/** The daily journal: what I planned, did, thought, felt. One entry per day. */
export interface JournalEntry {
  id: string;
  /** ISO date YYYY-MM-DD */
  date: string;
  /** free writing — "Today I'm thinking about…" */
  roughNotes: string;
  /** end-of-day reflection (went well / could improve / learned) */
  endOfDay: string;
  /** 1–5 */
  mood: number | null;
  /** 1–5 */
  energy: number | null;
  createdAt: number;
  updatedAt: number;
}

/** User-created tag: Rust, Family, French B2… independent of life areas. */
export interface Label {
  id: string;
  name: string;
  color: string;
  emoji: string;
  position: number;
  createdAt: number;
}

/** What a habit means to do on one specific day — "clean" → "clean desk"
 *  today, "side desk" tomorrow. One per habit per day; the habit itself
 *  still owns the single completion checkbox and streak. */
export interface HabitDayNote {
  id: string;
  itemId: string;
  /** ISO date YYYY-MM-DD */
  date: string;
  text: string;
  createdAt: number;
  updatedAt: number;
}

/** Manual drag order for one day's Today list — entry ids (real action ids,
 *  or virtual "habit:<itemId>:<date>" / "today-item:<itemId>" ids) in the
 *  order the user arranged them. One row per day. Completing a task never
 *  touches this — only dragging, or the explicit "Sort" tidy-up, does. */
export interface DayOrder {
  id: string;
  /** ISO date YYYY-MM-DD */
  date: string;
  order: string[];
  updatedAt: number;
}

export interface DB {
  areas: Area[];
  items: Item[];
  seeds: Seed[];
  actions: Action[];
  logs: Log[];
  reflections: Reflection[];
  journal: JournalEntry[];
  labels: Label[];
  habitDayNotes: HabitDayNote[];
  dayOrder: DayOrder[];
}

export const EMPTY_DB: DB = {
  areas: [],
  items: [],
  seeds: [],
  actions: [],
  logs: [],
  reflections: [],
  journal: [],
  labels: [],
  habitDayNotes: [],
  dayOrder: [],
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
  folder: { label: "Folder", emoji: "🗂️" },
  quote: { label: "Quote", emoji: "❝" },
  idea: { label: "Idea", emoji: "💡" },
  dream: { label: "Dream", emoji: "🌅" },
  goal: { label: "Goal", emoji: "🎯" },
  habit: { label: "Habit", emoji: "🔁" },
  routine: { label: "Routine", emoji: "🌄" },
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

/** Where a given kind actually lands once created, so a person picking a
 *  kind (or reading a "created" confirmation) can tell where to find it
 *  again without having to already know the app's layout. */
export function destinationFor(kind: ItemKind): { label: string; href: string; hint: string } {
  if (kind === "note" || kind === "folder") {
    return { label: "Notes", href: "/notes", hint: "Lives in Notes, ready to search or fold into something later." };
  }
  if (SPACE_KINDS.includes(kind)) {
    return {
      label: "Quiet Space",
      href: "/space",
      hint: "Lives in your Quiet Space, alongside the quotes and lessons worth reading again.",
    };
  }
  return { label: "Life", href: "/life", hint: "Lives in Life, tracked and scheduled with your other goals and habits." };
}
