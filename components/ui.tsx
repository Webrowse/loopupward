"use client";

import { ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";

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

/**
 * Bottom sheet on mobile, centered dialog on larger screens.
 *
 * Contract for every dialog in the app:
 * - always inside the visible viewport; content scrolls internally
 * - sticky header (title, optional back, always a close button)
 * - sticky footer with Cancel + primary action when `primary` is given
 * - Escape and outside click close; Enter fires the primary action
 *   (except inside textareas)
 */
export function Sheet({
  open, onClose, title, children, onSubmit, wide, onBack,
  primary, primaryDisabled, cancelLabel = "Cancel",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** fired by Enter (ignored inside textareas); defaults to primary.onClick */
  onSubmit?: () => void;
  wide?: boolean;
  /** show a back chevron in the header (nested sheets) */
  onBack?: () => void;
  /** sticky footer action; when set, footer shows Cancel + this button */
  primary?: { label: string; onClick: () => void; danger?: boolean };
  primaryDisabled?: boolean;
  cancelLabel?: string;
}) {
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
  const submit = onSubmit ?? primary?.onClick;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center overflow-hidden sm:p-6">
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-[2px] fade-in" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        onKeyDown={(e) => {
          if (
            submit &&
            !primaryDisabled &&
            e.key === "Enter" &&
            !e.shiftKey &&
            !(e.target instanceof HTMLTextAreaElement)
          ) {
            e.preventDefault();
            submit();
          }
        }}
        className={`sheet-up relative flex w-full ${wide ? "sm:max-w-xl" : "sm:max-w-md"} max-h-[88dvh] sm:max-h-[85dvh] flex-col bg-surface rounded-t-3xl sm:rounded-3xl border border-line-soft shadow-(--shadow-float)`}
      >
        {/* sticky header */}
        <div className="shrink-0 border-b border-line-soft pt-3 pb-3 px-5">
          <div className="mx-auto h-1 w-10 rounded-full bg-line sm:hidden" />
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              {onBack && (
                <button
                  onClick={onBack}
                  aria-label="Back"
                  className="pressable -ml-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 2 4 7l5 5" />
                  </svg>
                </button>
              )}
              {title && (
                <h2 className="min-w-0 truncate font-display text-xl text-ink leading-snug">{title}</h2>
              )}
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="pressable -mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M2 2l10 10M12 2 2 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* scrolling content */}
        <div
          className={`min-h-0 flex-1 overflow-y-auto px-5 pt-4 ${
            primary ? "pb-4" : "pb-[max(1.5rem,env(safe-area-inset-bottom))]"
          }`}
        >
          {children}
        </div>

        {/* sticky footer */}
        {primary && (
          <div className="shrink-0 border-t border-line-soft bg-surface px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] rounded-b-none sm:rounded-b-3xl">
            <div className="flex gap-2">
              <Button variant="ghost" full onClick={onClose}>{cancelLabel}</Button>
              <Button
                variant={primary.danger ? "danger" : "primary"}
                full
                onClick={primary.onClick}
                disabled={primaryDisabled}
              >
                {primary.label}
              </Button>
            </div>
          </div>
        )}
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

/** Back navigation: browser history when possible, sensible fallback otherwise. */
export function BackLink({ fallback = "/life", label = "Back" }: { fallback?: string; label?: string }) {
  const router = useRouter();
  return (
    <button
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) router.back();
        else router.push(fallback);
      }}
      className="pressable inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink-2"
    >
      <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 2 4 7l5 5" />
      </svg>
      {label}
    </button>
  );
}

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
