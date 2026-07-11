"use client";

import { useState } from "react";
import Link from "next/link";
import { LifeProvider, useLife } from "@/lib/data/provider";
import { api } from "@/lib/api";
import { PLANS, PlanId } from "@/lib/limits";
import { Button } from "@/components/ui";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

export default function PricingPage() {
  return (
    <LifeProvider>
      <Pricing />
    </LifeProvider>
  );
}

const PREMIUM_FEATURES = [
  "Unlimited life areas & goals",
  "Quarterly and yearly reviews",
  "Your complete history, forever",
  "Full heatmaps & advanced charts",
  "Custom dashboards & more trackers",
  "Priority on new templates",
];

function Pricing() {
  const { user, premium, cloudAvailable } = useLife();
  const [selected, setSelected] = useState<PlanId>("yearly");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "error" } | null>(null);

  const startCheckout = async () => {
    if (!user) {
      window.location.href = "/login";
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const data = await api<{
        subscriptionId: string;
        keyId: string;
        user: { email: string; name: string | null };
      }>("/v1/billing/subscribe", { method: "POST", body: { plan: selected } });

      await loadRazorpayScript();
      const rzp = new window.Razorpay!({
        key: data.keyId,
        subscription_id: data.subscriptionId,
        name: "LoopUpward Premium",
        description: PLANS.find((p) => p.id === selected)?.label,
        prefill: { email: data.user.email, name: data.user.name ?? "" },
        theme: { color: "#3d7a50" },
        handler: async (resp: {
          razorpay_payment_id: string;
          razorpay_subscription_id: string;
          razorpay_signature: string;
        }) => {
          try {
            await api("/v1/billing/confirm", {
              method: "POST",
              body: {
                paymentId: resp.razorpay_payment_id,
                subscriptionId: resp.razorpay_subscription_id,
                signature: resp.razorpay_signature,
                plan: selected,
              },
            });
            setMessage({ text: "Welcome to premium. Your space just got bigger. 🌿", tone: "ok" });
            setTimeout(() => (window.location.href = "/home"), 1600);
          } catch {
            setMessage({ text: "Payment received. Premium activates within a minute.", tone: "ok" });
          }
        },
      });
      rzp.open();
    } catch (e) {
      setMessage({
        text: e instanceof Error ? e.message : "Something went wrong. You haven't been charged. Please try again.",
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative z-[1] mx-auto min-h-dvh w-full max-w-lg px-6 pt-[max(2rem,env(safe-area-inset-top))] pb-16">
      <Link href="/you" className="text-sm text-ink-3 hover:text-ink-2">← Back</Link>

      <header className="pt-8 pb-8">
        <p className="text-sm text-ink-3">For people serious about becoming someone</p>
        <h1 className="font-display text-[2.2rem] leading-tight text-ink mt-1">
          LoopUpward Premium
        </h1>
      </header>

      {premium ? (
        <div className="rounded-(--radius-card) border border-line-soft bg-accent-soft p-6">
          <p className="font-display text-lg text-accent-deep">You&apos;re already premium 🌿</p>
          <p className="text-sm text-ink-2 mt-1">Thank you for building yourself with us.</p>
        </div>
      ) : (
        <>
          <ul className="space-y-2.5 mb-8">
            {PREMIUM_FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-3 text-[0.95rem] text-ink-2">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-deep text-xs">✓</span>
                {f}
              </li>
            ))}
          </ul>

          <div className="space-y-3 mb-8">
            {PLANS.map((plan) => (
              <button
                key={plan.id}
                onClick={() => setSelected(plan.id)}
                className={`pressable relative block w-full rounded-(--radius-card) border-2 bg-surface p-4 text-left transition-colors ${
                  selected === plan.id ? "border-accent" : "border-line-soft"
                }`}
              >
                {"best" in plan && plan.best && (
                  <span className="absolute -top-2.5 right-4 rounded-full bg-accent px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-white dark:text-[#10160f]">
                    Best value
                  </span>
                )}
                <div className="flex items-baseline justify-between">
                  <span className="font-medium text-ink">{plan.label}</span>
                  <span className="font-display text-xl text-ink">₹{plan.priceInr}</span>
                </div>
                <div className="flex items-baseline justify-between text-xs text-ink-3 mt-0.5">
                  <span>{plan.tagline}</span>
                  <span>≈ ₹{plan.perMonthInr}/month</span>
                </div>
              </button>
            ))}
          </div>

          <Button full onClick={startCheckout} disabled={busy || (!cloudAvailable && !user)}>
            {busy ? "Opening secure checkout…" : user ? "Continue" : "Sign in to subscribe"}
          </Button>
          {message && (
            <p
              role="status"
              className={`mt-4 text-center text-sm ${message.tone === "error" ? "text-danger" : "text-accent-deep"}`}
            >
              {message.text}
            </p>
          )}
          <p className="mt-4 text-center text-xs leading-relaxed text-ink-3">
            Secure payments by Razorpay: UPI, cards, netbanking, international cards.
            Renews automatically; cancel anytime and keep premium until your period ends.
          </p>
        </>
      )}
    </div>
  );
}

function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load payment provider"));
    document.body.appendChild(s);
  });
}
