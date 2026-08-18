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
  | "list"
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
  /** The life node this step stands for. "Duolingo" inside the morning
   *  routine and the Duolingo habit on the day's list are one act, not two
   *  that happen to share a name, so ticking either ticks both. Null (or
   *  absent, on steps written before this existed) means the step is just a
   *  line of text. */
  itemId?: string | null;
  /** A step the routine finishes without. Skipping it still counts the day
   *  as done, so a script can carry its nice-to-haves ("stretch if there's
   *  time") without the whole routine failing on the morning you skip one. */
  optional?: boolean;
}

/** One line of a list: "milk — 2 l". Entries aren't separate items — the
 *  list is one node; its contents are ticked in place and stay ticked
 *  (unlike routine steps, which reset with each day). */
export interface ListEntry {
  id: string;
  text: string;
  /** optional quantity — entries sharing a unit sum into the list's total line */
  amount: number | null;
  unit: string | null;
  done: boolean;
  /** When this became the thing being tried (epoch ms), so a list of things to
   *  try holds three states, not two: waiting, trying, done. A hobby list needs
   *  to say "I'm on pottery"; a travel list needs to say "Hampi is next". A
   *  timestamp rather than a flag, because how long it's been in progress is
   *  the part worth knowing. Cleared when the entry is ticked done. */
  pickedAt: number | null;
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
  /** What this part of life actually is, in your own words. Optional, and
   *  written for the export: an area score means more than "the lowest
   *  completion rate" once the area says what it is for. */
  description?: string;
  whyItMatters?: string;
  /** Share of your attention this area is meant to get, 0..1. Optional —
   *  an unweighted life is a valid life. */
  targetShare?: number | null;
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
  /** list kind only: the checkable contents — array order is display order */
  entries: ListEntry[] | null;
  /** routine kind only: when this shows on the Today list, as "HH:MM" 24h
   *  local time — a morning routine before noon, a night routine after 9pm.
   *  End may be earlier than start (21:00 → 02:00 wraps past midnight).
   *  Both null = visible all day. */
  windowStart: string | null;
  windowEnd: string | null;
  /** pulled onto Today from a week/month/quarter/year list — a non-destructive
   *  overlay that leaves `horizon` intact, so the goal keeps its place in that
   *  period list (and its record there) while also appearing on Today. The
   *  "→ Today" button sets it; "Recall" clears it; completing the item shows
   *  done in both places because it is the same node. */
  pulledToday: boolean;
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

/**
 * Where a progress value came from. A manual tick, a focus-timer completion,
 * a routine's auto-log and a cascade from a finished child used to write
 * identical rows and could not be told apart afterwards.
 *
 * "unknown" is not a bug: rows written before this existed carry it, and
 * claiming they were manual would be a lie in the data.
 */
export type LogSource =
  | "manual"
  | "today_check"
  | "item_page"
  | "focus_timer"
  | "routine_run"
  | "parent_cascade"
  | "import"
  | "unknown";

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
  /** how this value got here — see LogSource */
  source?: LogSource;
  /** the specific control that did it ("today_checkbox", "step_meter"), for
   *  when the source alone is too coarse to answer a question */
  via?: string;
}

/** A commitment made for the NEXT period. Optionally naming an item and a
 *  number, which is the only reason a period can ever be scored against what
 *  the last one promised — by counting, never by judging. */
export interface Intention {
  id: string;
  text: string;
  /** the item this promise is about, when it is about one */
  itemId: string | null;
  /** what "kept" would mean in numbers: 5 (days, units, pages…) */
  targetValue: number | null;
}

export interface ReflectionRatings {
  overall: number | null;
  energy: number | null;
  progress: number | null;
}

export interface AreaNote {
  rating: number | null;
  note: string;
}

/** Free-text reflection attached to a review period, plus the structure that
 *  lets the next period measure itself against this one. */
export interface Reflection {
  id: string;
  period: "week" | "month" | "quarter" | "year";
  /** e.g. 2026-W27 / 2026-07 / 2026-Q3 / 2026 */
  periodKey: string;
  text: string;
  createdAt: number;
  updatedAt: number;
  /** overall / energy / progress, each 1–5 */
  ratings?: ReflectionRatings | null;
  /** per areaId */
  areaNotes?: Record<string, AreaNote> | null;
  wins?: string[];
  lessons?: string[];
  blockers?: string[];
  /** promises for the period after this one */
  intentions?: Intention[] | null;
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
  /* the quiet, optional half of a day — all nullable, all behind a
     disclosure, because the daily flow must not get longer for anyone
     who does not want these */
  sleepHours?: number | null;
  /** 1–5 */
  sleepQuality?: number | null;
  /** 1–5 */
  stress?: number | null;
  /** 1–5 — how focused the day felt, not how much got done */
  focus?: number | null;
  gratitude?: string;
  /** "one thing that would make today good" */
  intention?: string;
  tags?: string[];
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
  /** routines only: ids of the steps already done on this day — the same
   *  one-row-per-item-per-day home the day's plan text lives in. When every
   *  step is here, the routine's day is logged like any habit. */
  doneSteps: string[] | null;
  /** stepId → epoch ms it was ticked. doneSteps alone is timeless: it says
   *  which steps happened, never when or in what order. Kept beside it
   *  rather than replacing it, so everything already reading doneSteps
   *  keeps working untouched. */
  doneStepsAt?: Record<string, number> | null;
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

/* ————— capture streams —————
 *
 * Two append-only logs that sit beside the tables above rather than inside
 * them. Nothing on screen reads either one: they exist so that a year from
 * now the export can answer questions the app was never asked, including the
 * unflattering ones. They are never edited and never deleted.
 *
 * Every row carries epoch ms PLUS the IANA zone and UTC offset captured at
 * write time, so a year spanning DST and travel stays interpretable, and the
 * local `day` it belongs to under the app's own day-attribution rules — which
 * is NOT always its calendar day (see routineLogDay in lib/progress.ts).
 */

/** What a timer attempt was. A routine run produces one row per step plus one
 *  for the run itself; "rest" is the breather between two of them. */
export type FocusKind = "focus" | "routine_step" | "routine_run" | "day_run" | "rest";

/**
 * How an attempt ended:
 *  completed   — the thing got ticked
 *  expired     — the countdown ran out and the screen was left
 *  abandoned   — closed mid-attempt
 *  skipped     — deliberately passed over (sent to the back, or left out)
 *  interrupted — swapped away from for something else
 */
export type FocusOutcome = "completed" | "abandoned" | "skipped" | "interrupted" | "expired";

export interface FocusSession {
  id: string;
  itemId: string | null;
  /** the Today row it started from — a real action id, or a virtual
   *  "habit:<itemId>:<date>" / "today-item:<itemId>" id */
  entryId: string;
  day: string;
  kind: FocusKind;
  /** routine_step only */
  stepId: string | null;
  startedAt: number;
  endedAt: number;
  /** what was asked for; null means untimed, counted up instead */
  plannedSeconds: number | null;
  /** wall-clock seconds it actually ran, pauses excluded */
  actualSeconds: number;
  pausedSeconds: number;
  pauseCount: number;
  outcome: FocusOutcome;
  tz: string;
  utcOffsetMinutes: number;
  createdAt: number;
}

/**
 * Every behavioural fact worth keeping. The type strings are the vocabulary
 * of the export's events.ndjson, so they are documented once here and never
 * renamed — a reader a year from now has only these words to go on.
 */
export const EVENT_TYPES = [
  // a node's whole life, from birth to purge
  "item.created", "item.renamed", "item.kind_changed", "item.tracker_changed",
  "item.horizon_changed", "item.target_changed", "item.cadence_changed", "item.window_changed",
  "item.moved", "item.labels_changed", "item.pinned", "item.unpinned",
  "item.status_changed", "item.steps_changed", "item.body_edited", "item.pulled_today_changed",
  "item.completed", "item.reopened", "item.trashed", "item.restored", "item.purged",
  // what actually got planned, moved, and done
  "action.created", "action.rescheduled", "action.amount_changed", "action.priority_changed",
  "action.note_edited", "action.done", "action.undone", "action.deleted",
  // routines, including the steps that did not happen
  "routine.step_done", "routine.step_undone", "routine.step_skipped", "routine.reordered",
  // walking the day one row at a time
  "day_run.started", "day_run.finished", "day_run.abandoned",
  // lists, seeds, order
  "list.entry_added", "list.entry_picked", "list.entry_done",
  "seed.captured", "seed.planted", "seed.status_changed", "seed.deleted",
  "day.reordered",
  // the writing half
  "journal.saved", "reflection.saved",
  // what the person says about themselves, and what each area is for — the
  // only record that these ever read differently than they read today
  "settings.changed", "area.context_changed",
  // being here at all
  "app.opened", "page.viewed",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export interface AppEvent {
  id: string;
  /** epoch ms the thing happened */
  at: number;
  day: string;
  tz: string;
  utcOffsetMinutes: number;
  type: EventType;
  itemId: string | null;
  payload: Record<string, unknown>;
  createdAt: number;
}

/**
 * Server-owned preferences and context, one row per user. Everything is
 * optional and nothing gates a feature: a user who fills in none of it sees
 * exactly today's app. The context fields exist for one reason — they are
 * what makes an exported year readable a year later, by you or by whatever
 * tool you hand it to.
 */
export interface UserSettings {
  /* display, previously localStorage-only (localStorage stays the offline
     cache and the anti-FOUC boot value; the server wins on load) */
  theme: "light" | "dark" | null;
  font: string | null;
  simple: boolean | null;
  restSeconds: number | null;

  /* clock — how this person's day is actually shaped */
  timezone: string | null;
  /** 0 = Sunday … 6 = Saturday */
  weekStart: number | null;
  /** the hour a "day" rolls over. Default 4: before 4am you are still living
   *  last night, which is exactly what routineLogDay() assumes. */
  dayRolloverHour: number | null;
  wakeTime: string | null;
  sleepTime: string | null;

  /* context, all free text */
  seasonOfLife: string | null;
  occupation: string | null;
  /** in one line: who you are trying to become */
  becoming: string | null;
  /** what is genuinely in the way right now */
  constraints: string | null;

  /* what you are aiming at, so the numbers have something to mean */
  focusMinutesTarget: number | null;
  habitDaysTarget: number | null;
  deepWorkDaysTarget: number | null;

  createdAt: number | null;
  updatedAt: number | null;
}

export const DEFAULT_DAY_ROLLOVER_HOUR = 4;

export const EMPTY_SETTINGS: UserSettings = {
  theme: null, font: null, simple: null, restSeconds: null,
  timezone: null, weekStart: null, dayRolloverHour: null, wakeTime: null, sleepTime: null,
  seasonOfLife: null, occupation: null, becoming: null, constraints: null,
  focusMinutesTarget: null, habitDaysTarget: null, deepWorkDaysTarget: null,
  createdAt: null, updatedAt: null,
};

/** The two append-only streams, kept out of DB on purpose: nothing in the UI
 *  reads them, so they must never take part in a render or be shipped down
 *  the wire on a page load. See lib/data/streams.ts. */
export interface Streams {
  focusSessions: FocusSession[];
  events: AppEvent[];
}

export const EMPTY_STREAMS: Streams = { focusSessions: [], events: [] };

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
  list: { label: "List", emoji: "📋" },
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
