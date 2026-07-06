import Link from "next/link";

export default function Landing() {
  return (
    <div className="relative z-[1] mx-auto flex min-h-dvh w-full max-w-lg flex-col px-6 pt-[max(3rem,env(safe-area-inset-top))] pb-10">
      <p className="text-sm font-medium tracking-wide text-ink-3">LoopUpward</p>

      <h1 className="font-display mt-10 text-[2.6rem] leading-[1.12] text-ink">
        You already know
        <br />
        who you want
        <br />
        to become.
      </h1>

      <p className="mt-6 max-w-sm text-[1.05rem] leading-relaxed text-ink-2">
        The videos you watch, the books you save, the quotes that stop you — those
        thoughts usually disappear. LoopUpward gives them a permanent home, and a path
        into daily action.
      </p>

      <div className="mt-10 space-y-3 text-[0.95rem] text-ink-2">
        {[
          ["🌱", "Capture any thought in under five seconds"],
          ["🪆", "Turn it into goals inside goals inside goals"],
          ["☀️", "Do a few small things every day"],
          ["🪞", "Look back and see that you actually changed"],
        ].map(([e, t]) => (
          <div key={t} className="flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line-soft bg-surface shadow-(--shadow-card)">
              {e}
            </span>
            {t}
          </div>
        ))}
      </div>

      <div className="mt-auto pt-12">
        <Link
          href="/home"
          className="pressable block w-full rounded-2xl bg-accent py-4 text-center text-[1.05rem] font-medium text-white dark:text-[#10160f]"
        >
          Open your space
        </Link>
        <p className="mt-3 text-center text-xs text-ink-3">
          Free to use · your data stays yours
        </p>
      </div>
    </div>
  );
}
