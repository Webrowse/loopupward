/** Free plan limits. Premium removes them. Generous enough to love the product. */

export const FREE_LIMITS = {
  areas: 4,
  activeItems: 40,
  /** review history window in days for free accounts */
  historyDays: 84, // ~12 weeks
  /** review periods available on free */
  periods: ["week", "month"] as const,
  /** days a deleted item stays recoverable in Trash */
  trashDays: 7,
};

/** premium keeps trashed items around longer, not forever — bounded so
 *  storage doesn't grow without limit */
export const PREMIUM_TRASH_DAYS = 30;

export const PLANS = [
  {
    id: "quarterly",
    label: "Quarterly",
    months: 3,
    priceInr: 499,
    perMonthInr: 166,
    priceUsd: 12,
    perMonthUsd: 4,
    tagline: "Try it for a season",
  },
  {
    id: "halfyearly",
    label: "Half-yearly",
    months: 6,
    priceInr: 849,
    perMonthInr: 142,
    priceUsd: 20,
    perMonthUsd: 3.4,
    tagline: "Two seasons of growth",
  },
  {
    id: "yearly",
    label: "Yearly",
    months: 12,
    priceInr: 1499,
    perMonthInr: 125,
    priceUsd: 35,
    perMonthUsd: 2.9,
    tagline: "A full year of becoming",
    best: true,
  },
] as const;

export type PlanId = (typeof PLANS)[number]["id"];

/** The two currencies we bill in. India pays INR; everyone else USD.
 *  Never user-selectable — detection decides (see lib/currency.ts). */
export type BillingCurrency = "INR" | "USD";

export function planPrice(plan: (typeof PLANS)[number], currency: BillingCurrency) {
  return currency === "INR"
    ? { price: `₹${plan.priceInr}`, perMonth: `₹${plan.perMonthInr}` }
    : { price: `$${plan.priceUsd}`, perMonth: `$${plan.perMonthUsd}` };
}

/** Server-side text caps (backend/src/limits.rs) — mirrored here so the
 *  first-sign-in import can make local data fit before sending, and the
 *  capture box can stop oversized seeds from existing at all. Journal caps
 *  are the free-plan ones: a first sign-in is never premium yet. */
export const SERVER_CAPS = {
  seedText: 2_000,
  title: 400,
  note: 8_000,
  richBody: 50_000,
  reflectionText: 20_000,
  habitDayNote: 500,
  journalRough: 5_000,
  journalEod: 3_000,
} as const;

export function isPremium(premiumUntil: string | null | undefined): boolean {
  if (!premiumUntil) return false;
  return new Date(premiumUntil).getTime() > Date.now();
}

/** Grant durations the owner can hand out from the admin panel. */
export const GRANT_OPTIONS = [
  { label: "7 days", days: 7 },
  { label: "1 month", days: 31 },
  { label: "6 months", days: 183 },
  { label: "1 year", days: 366 },
  { label: "Lifetime", days: 365 * 100 },
] as const;
