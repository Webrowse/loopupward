import { Cadence, Horizon, ItemKind, TrackerType } from "./types";

/**
 * Borrowable targets — small, concrete, already shaped for the app.
 * A "task" lands on Today once; everything else becomes a life node with
 * its repeat/horizon pre-filled, so borrowing one teaches the model too.
 */
export interface Suggestion {
  title: string;
  /** one-time task for today (default), or a pre-shaped life node */
  kind?: ItemKind;
  tracker?: TrackerType;
  cadence?: Cadence;
  /** for cadence "days": weekday numbers, 0 = Sunday */
  cadenceDays?: number[];
  /** for cadence "weekly": times per week */
  cadenceCount?: number;
  horizon?: Horizon;
  /** daily amount for habits ("refill twice a day" → 2) */
  target?: number;
  unit?: string;
}

export interface SuggestionGroup {
  label: string;
  emoji: string;
  items: Suggestion[];
}

export const SUGGESTIONS: SuggestionGroup[] = [
  {
    label: "Physical glow & daily habits",
    emoji: "✨",
    items: [
      { title: "Book a haircut that suits your face shape" },
      { title: "Cleanser + moisturizer, morning and night", kind: "habit", cadence: "daily" },
      { title: "Refill the 1L water bottle", kind: "habit", cadence: "daily", target: 2, unit: "bottles" },
      { title: "Gym", kind: "habit", cadence: "weekly", cadenceCount: 3 },
      { title: "Set a fixed bedtime alarm" },
      { title: "Set the same wake-up alarm for every morning" },
      { title: "Clean your room this Sunday" },
      { title: "Reset your room", kind: "habit", cadence: "days", cadenceDays: [0] },
      { title: "Take full-body progress photos" },
    ],
  },
  {
    label: "Social circle & boundaries",
    emoji: "🤝",
    items: [
      { title: "Unfollow accounts that make you feel insecure" },
      { title: "Mute someone who constantly drains your energy" },
      { title: "Call one friend or family member", kind: "habit", cadence: "days", cadenceDays: [0] },
      { title: "Plan one coffee or walk with a friend this week" },
      { title: "Delete old screenshots of conversations you keep rereading" },
      { title: "Say “no” to one thing you don’t actually want to do" },
      { title: "Turn off notifications for social media apps" },
      { title: "Replace brain-rot content with creators who make you smarter" },
    ],
  },
  {
    label: "Money, skills & career",
    emoji: "💼",
    items: [
      { title: "Transfer a small amount to savings" },
      { title: "Set up an automatic monthly transfer to savings" },
      { title: "Track today’s expenses", kind: "habit", cadence: "daily" },
      { title: "Cancel one subscription you don’t use" },
      { title: "One skill that can make money — 60 days on it", kind: "goal", tracker: "check", horizon: "quarter" },
      { title: "Enroll in one online course this week" },
      { title: "Start a small project with a deadline", kind: "project", tracker: "check", horizon: "month" },
      { title: "Update your resume or portfolio this weekend" },
      { title: "Apply to one opportunity", kind: "habit", cadence: "daily" },
    ],
  },
  {
    label: "Mindset & mental health",
    emoji: "🌿",
    items: [
      { title: "Read 10 pages before sleep", kind: "habit", cadence: "daily" },
      { title: "5-minute journal before bed", kind: "habit", cadence: "daily" },
      { title: "Write down 3 wins", kind: "habit", cadence: "days", cadenceDays: [0] },
      { title: "Meditate for 5 minutes", kind: "habit", cadence: "daily" },
      { title: "Try one new hobby this month", kind: "goal", tracker: "check", horizon: "month" },
      { title: "One uncomfortable but good-for-you task", kind: "habit", cadence: "daily" },
      { title: "Write a letter forgiving your past self" },
      { title: "Set one realistic goal for the next 90 days", kind: "goal", tracker: "check", horizon: "quarter" },
      { title: "A simple daily routine, followed for a week", kind: "routine", tracker: "habit" },
    ],
  },
  {
    label: "Lifestyle & personal growth",
    emoji: "🌍",
    items: [
      { title: "Take one photo of your real life today" },
      { title: "Go on a solo coffee or dinner date" },
      { title: "Spend one full day offline this month", kind: "goal", tracker: "check", horizon: "month" },
      { title: "Clean your phone gallery" },
      { title: "Write the list of promises to yourself" },
      { title: "Try a new class (dance, pottery, boxing…)", kind: "goal", tracker: "check", horizon: "month" },
      { title: "Rearrange your room for a fresh start" },
      { title: "Create a vision board" },
      { title: "Write a letter to your future self, one year out" },
    ],
  },
];

/** The one-time ones, for sprinkling onto an empty Today. */
export function quickTasks(count: number): string[] {
  const pool = SUGGESTIONS.flatMap((g) => g.items.filter((s) => !s.kind).map((s) => s.title));
  // stable-ish daily shuffle: rotate by day so the empty state breathes
  // without flickering on every render
  const offset = Math.floor(Date.now() / 86_400_000) % pool.length;
  return Array.from({ length: Math.min(count, pool.length) }, (_, i) => pool[(offset + i * 7) % pool.length]);
}
