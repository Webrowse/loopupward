"use client";

import { useMemo } from "react";
import { addDays, startOfWeek, today } from "@/lib/dates";
import { heatColor } from "@/lib/palette";
import { useLife } from "@/lib/data/provider";

/** Circular progress ring — the Today hero. */
export function Ring({
  value, size = 120, stroke = 9, color = "var(--accent)", label, sub,
}: {
  value: number; // 0..1
  size?: number;
  stroke?: number;
  color?: string;
  label?: string;
  sub?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={{ transition: "stroke-dashoffset 0.7s cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {label && <span className="font-display text-2xl text-ink leading-none">{label}</span>}
        {sub && <span className="text-xs text-ink-3 mt-1">{sub}</span>}
      </div>
    </div>
  );
}

export function Bar({
  value, color = "var(--accent)", height = 8,
}: { value: number; color?: string; height?: number }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="w-full rounded-full bg-surface-2 overflow-hidden" style={{ height }}>
      <div
        className="bar-fill h-full rounded-full"
        style={{ width: `${v * 100}%`, background: color, minWidth: v > 0 ? height : 0 }}
      />
    </div>
  );
}

/** GitHub-style consistency heatmap. Sequential moss ramp, hairline cell borders. */
export function Heatmap({
  counts, weeks = 16,
}: { counts: Map<string, number>; weeks?: number }) {
  const { theme } = useLife();
  const dark = theme === "dark";
  const { grid, max } = useMemo(() => {
    const end = today();
    const firstWeek = addDays(startOfWeek(end), -(weeks - 1) * 7);
    const cols: { day: string; v: number }[][] = [];
    let max = 0;
    for (let w = 0; w < weeks; w++) {
      const col: { day: string; v: number }[] = [];
      for (let d = 0; d < 7; d++) {
        const day = addDays(firstWeek, w * 7 + d);
        const v = counts.get(day) ?? 0;
        if (day <= end) max = Math.max(max, v);
        col.push({ day, v });
      }
      cols.push(col);
    }
    return { grid: cols, max };
  }, [counts, weeks]);

  const end = today();
  return (
    <div className="overflow-x-auto no-scrollbar">
      <div className="flex gap-1 w-max">
        {grid.map((col, i) => (
          <div key={i} className="flex flex-col gap-1">
            {col.map((cell) => (
              <div
                key={cell.day}
                title={`${cell.day}: ${cell.v}`}
                className="h-3 w-3 rounded-[3px] border"
                style={{
                  background: cell.day > end ? "transparent" : heatColor(cell.v, max, dark),
                  borderColor: cell.day > end ? "transparent" : "var(--line-soft)",
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function StatTile({
  label, value, sub, accent,
}: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="rounded-(--radius-card) border border-line-soft bg-surface p-4 shadow-(--shadow-card)">
      <div className="text-xs font-medium uppercase tracking-wide text-ink-3">{label}</div>
      <div className={`font-display text-[1.75rem] leading-tight mt-1 ${accent ? "text-accent-deep" : "text-ink"}`}>
        {value}
      </div>
      {sub && <div className="text-xs text-ink-3 mt-0.5">{sub}</div>}
    </div>
  );
}
