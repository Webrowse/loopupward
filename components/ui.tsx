"use client";

import { ReactNode, useEffect } from "react";

export function Button({
  children, onClick, variant = "primary", disabled, type = "button", full, small,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "soft" | "ghost" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
  full?: boolean;
  small?: boolean;
}) {
  const base =
    "pressable inline-flex items-center justify-center gap-2 rounded-(--radius-btn) font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none";
  const size = small ? "px-3.5 py-2 text-sm" : "px-5 py-3 text-[0.95rem]";
  const variants = {
    primary: "bg-accent text-white hover:opacity-90 dark:text-[#10160f]",
    soft: "bg-accent-soft text-accent-deep hover:opacity-85",
    ghost: "bg-transparent text-ink-2 hover:bg-surface-2",
    danger: "bg-transparent text-danger hover:bg-danger/10",
  } as const;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${size} ${variants[variant]} ${full ? "w-full" : ""}`}
    >
      {children}
    </button>
  );
}

export function Card({
  children, onClick, className = "",
}: { children: ReactNode; onClick?: () => void; className?: string }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`block w-full text-left bg-surface rounded-(--radius-card) border border-line-soft shadow-(--shadow-card) ${
        onClick ? "pressable cursor-pointer" : ""
      } ${className}`}
    >
      {children}
    </Tag>
  );
}

export function Chip({
  children, active, onClick, style,
}: { children: ReactNode; active?: boolean; onClick?: () => void; style?: React.CSSProperties }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={style}
      className={`pressable shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium border transition-colors ${
        active
          ? "bg-ink text-bg border-ink"
          : "bg-surface text-ink-2 border-line hover:border-ink-3"
      }`}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string>({
  options, value, onChange,
}: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-full bg-surface-2 p-1 gap-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-all ${
            value === o.value ? "bg-surface text-ink shadow-(--shadow-card)" : "text-ink-3"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Bottom sheet — the app's primary editing surface on mobile. */
export function Sheet({
  open, onClose, title, children,
}: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-[2px] fade-in" onClick={onClose} />
      <div className="sheet-up relative w-full sm:max-w-md max-h-[88dvh] overflow-y-auto bg-surface rounded-t-3xl sm:rounded-3xl border border-line-soft shadow-(--shadow-float) pb-[env(safe-area-inset-bottom)]">
        <div className="sticky top-0 bg-surface pt-3 pb-2 px-5 rounded-t-3xl">
          <div className="mx-auto h-1 w-10 rounded-full bg-line sm:hidden" />
          {title && (
            <h2 className="font-display text-xl mt-3 text-ink">{title}</h2>
          )}
        </div>
        <div className="px-5 pb-6">{children}</div>
      </div>
    </div>
  );
}

export function Field({
  label, children,
}: { label: string; children: ReactNode }) {
  return (
    <label className="block mb-4">
      <span className="block text-[0.8rem] font-medium uppercase tracking-wide text-ink-3 mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}

export const inputCls =
  "w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[0.95rem] text-ink placeholder:text-ink-3 outline-none focus:border-accent transition-colors";

export function EmptyState({
  emoji, title, body, children,
}: { emoji: string; title: string; body: string; children?: ReactNode }) {
  return (
    <div className="rise-in text-center py-14 px-6">
      <div className="text-4xl mb-4">{emoji}</div>
      <h3 className="font-display text-xl text-ink mb-2">{title}</h3>
      <p className="text-[0.95rem] text-ink-2 max-w-xs mx-auto leading-relaxed">{body}</p>
      {children && <div className="mt-6 flex justify-center">{children}</div>}
    </div>
  );
}
