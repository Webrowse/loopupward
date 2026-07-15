"use client";

import Link from "next/link";
import { BackLink } from "@/components/ui";

const STEPS = [
  {
    emoji: "💭",
    title: "Capture: get it out of your head",
    body:
      "A goal, a book, a quote, “learn guitar someday.” Write it in five seconds and let it go. Nothing needs a category yet.",
    href: "/home",
    link: "Capture a thought",
  },
  {
    emoji: "🪴",
    title: "Life: organize what matters",
    body:
      "When a thought keeps coming back, give it a shape: a goal, a habit, a money target. Nest smaller things inside bigger ones, like Learn French → Reach B2 → Finish grammar book → This week's chapters. Nothing is rigid: move anything between areas, parents, and time horizons whenever your life changes.",
    href: "/life",
    link: "See your life",
  },
  {
    emoji: "☀️",
    title: "Plan: today, and further out",
    body:
      "Schedules put things on Today automatically: every day, Mon/Wed/Fri, 4× a week, monthly. Completing a small action updates the habit's streak and the goal it belongs to. Progress flows upward. The Week, Month, Quarter, and Year tabs hold the same view for anything planned further out. Pull any of them into Today when you're ready to act on it.",
    href: "/today",
    link: "Open Today",
  },
  {
    emoji: "🪞",
    title: "Reflect: see who you're becoming",
    body:
      "Weekly, monthly, and yearly reviews are built from your real history: every day you showed up, every page, every rupee. Unfinished plans are not failures. They're information about what to try differently.",
    href: "/reflect",
    link: "Reflect",
  },
];

export default function GuidePage() {
  return (
    <div className="rise-in lg:max-w-2xl">
      <div className="pt-2">
        <BackLink fallback="/home" />
      </div>
      <header className="pt-4 pb-8">
        <p className="text-sm text-ink-3">How LoopUpward works</p>
        <h1 className="font-display text-[2rem] leading-tight text-ink mt-1">
          One loop, repeated gently
        </h1>
        <p className="mt-3 text-[0.95rem] leading-relaxed text-ink-2">
          Capture → organize → act → reflect. That&apos;s the whole idea. The loop turns
          scattered intentions into evidence that you&apos;re changing.
        </p>
      </header>

      <div className="space-y-4">
        {STEPS.map((s, i) => (
          <section
            key={s.title}
            className="rise-in rounded-(--radius-card) border border-line-soft bg-surface p-5 shadow-(--shadow-card)"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <div className="flex items-start gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-surface-2 text-xl">
                {s.emoji}
              </span>
              <div className="min-w-0">
                <h2 className="font-display text-lg text-ink">{s.title}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{s.body}</p>
                <Link href={s.href} className="mt-2 inline-block text-sm font-medium text-accent-deep">
                  {s.link} →
                </Link>
              </div>
            </div>
          </section>
        ))}
      </div>

      <p className="mt-10 text-center text-sm leading-relaxed text-ink-3 max-w-sm mx-auto">
        Missed days carry forward without shame. The question is never “did you fail
        today?” It&apos;s “is your life moving toward the person you wanted to become?”
      </p>
    </div>
  );
}
