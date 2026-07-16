import { BillingCurrency } from "./limits";

/**
 * India pays in rupees, everyone else in dollars — decided here, never by
 * a currency picker. The real answer comes from Cloudflare's country header
 * via /api/geo; the timezone guess only covers local dev and the rare case
 * where the header is missing. Razorpay then does the rest: the INR plans
 * take UPI/cards/netbanking domestically, the USD plans take international
 * cards.
 */
export function guessCurrencyFromTimezone(): BillingCurrency {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz === "Asia/Kolkata" || tz === "Asia/Calcutta" ? "INR" : "USD";
  } catch {
    return "INR";
  }
}

export async function detectCurrency(): Promise<BillingCurrency> {
  // dev-only override for exercising the international path without a VPN:
  // /pricing?ccy=USD — compiled out of production builds entirely
  if (process.env.NODE_ENV !== "production") {
    const forced = new URLSearchParams(window.location.search).get("ccy");
    if (forced === "USD" || forced === "INR") return forced;
  }
  try {
    const res = await fetch("/api/geo", { cache: "no-store" });
    if (res.ok) {
      const { country } = (await res.json()) as { country: string | null };
      if (country) return country === "IN" ? "INR" : "USD";
    }
  } catch {
    // no geo — the guess below stands
  }
  return guessCurrencyFromTimezone();
}
