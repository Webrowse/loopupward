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
    tagline: "Try it for a season",
  },
  {
    id: "halfyearly",
    label: "Half-yearly",
    months: 6,
    priceInr: 849,
    perMonthInr: 142,
    tagline: "Two seasons of growth",
  },
  {
    id: "yearly",
    label: "Yearly",
    months: 12,
    priceInr: 1499,
    perMonthInr: 125,
    tagline: "A full year of becoming",
    best: true,
  },
] as const;

export type PlanId = (typeof PLANS)[number]["id"];

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
