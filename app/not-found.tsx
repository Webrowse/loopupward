import Link from "next/link";

const DESTINATIONS = [
  { href: "/home", label: "Mind", hint: "capture a thought" },
  { href: "/today", label: "Today", hint: "your small actions" },
  { href: "/life", label: "Life", hint: "everything you're growing" },
  { href: "/reflect", label: "Reflect", hint: "how far you've come" },
];

export default function NotFound() {
  return (
    <div className="relative z-[1] mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center px-6 pt-[max(3rem,env(safe-area-inset-top))] pb-10 text-center">
      <p className="text-sm font-medium tracking-wide text-ink-3">LoopUpward</p>

      <div className="mt-8 text-5xl">🧭</div>

      <h1 className="font-display mt-6 text-[2rem] leading-tight text-ink">
        This page wandered off
      </h1>

      <p className="mt-4 max-w-sm text-[1.05rem] leading-relaxed text-ink-2">
        There&apos;s nothing here — the link may be old, or the thing you&apos;re looking
        for moved. Your data is safe; let&apos;s get you back.
      </p>

      <div className="mt-10 w-full max-w-xs space-y-2.5">
        {DESTINATIONS.map((d) => (
          <Link
            key={d.href}
            href={d.href}
            className="pressable flex items-center justify-between rounded-2xl border border-line-soft bg-surface px-4 py-3 text-left shadow-(--shadow-card)"
          >
            <span className="font-medium text-ink">{d.label}</span>
            <span className="text-sm text-ink-3">{d.hint}</span>
          </Link>
        ))}
      </div>

      <Link
        href="/"
        className="mt-8 text-sm font-medium text-accent-deep hover:opacity-80"
      >
        ← Back to the start
      </Link>
    </div>
  );
}
