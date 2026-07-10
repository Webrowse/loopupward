"use client";

import { useEffect, useRef, useState } from "react";

const HIGHLIGHT_BG = "#fef08a";
const HIGHLIGHT_FG = "#1a1a1a";
const FONT_SIZES = [
  { label: "S", size: "0.85rem" },
  { label: "M", size: "1rem" },
  { label: "L", size: "1.25rem" },
  { label: "XL", size: "1.6rem" },
];
const FONT_COLORS = ["#211e19", "#b4543e", "#c07423", "#3d7a50", "#2a5e8f"];

/** Wraps the current selection in a styled span — used for highlight, font
 *  size and font color, which execCommand can't do with arbitrary CSS
 *  values. Falls back to extract+wrap when the selection crosses element
 *  boundaries (surroundContents only handles the simple case). */
function wrapSelection(style: Partial<CSSStyleDeclaration>) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  const span = document.createElement("span");
  Object.assign(span.style, style);
  try {
    range.surroundContents(span);
  } catch {
    const frag = range.extractContents();
    span.appendChild(frag);
    range.insertNode(span);
  }
  sel.removeAllRanges();
  const next = document.createRange();
  next.selectNodeContents(span);
  sel.addRange(next);
}

/**
 * Minimal rich-text editor: contentEditable + the browser's own execCommand
 * for bold/italic/underline/bullets (zero dependencies), plus a small
 * span-wrapping helper for highlight/font-size/font-color. Uncontrolled by
 * design — content is written to the DOM directly and read back on input,
 * never re-rendered from React state on every keystroke, so the caret never
 * jumps mid-type.
 */
export function RichTextEditor({
  value, onChange, placeholder, minHeightClass = "min-h-40",
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeightClass?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lastValue = useRef<string | null>(null);
  const [empty, setEmpty] = useState(!value.trim());

  useEffect(() => {
    if (ref.current && value !== lastValue.current && document.activeElement !== ref.current) {
      ref.current.innerHTML = value;
      lastValue.current = value;
      setEmpty(!value.trim());
    }
  }, [value]);

  const handleInput = () => {
    if (!ref.current) return;
    lastValue.current = ref.current.innerHTML;
    setEmpty(!ref.current.textContent?.trim());
    onChange(ref.current.innerHTML);
  };

  const exec = (cmd: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    handleInput();
  };

  const style = (s: Partial<CSSStyleDeclaration>) => {
    ref.current?.focus();
    wrapSelection(s);
    handleInput();
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1">
        <ToolButton label="Bold" onAction={() => exec("bold")}><b>B</b></ToolButton>
        <ToolButton label="Italic" onAction={() => exec("italic")}><i>I</i></ToolButton>
        <ToolButton label="Underline" onAction={() => exec("underline")}><u>U</u></ToolButton>
        <ToolButton label="Bullet list" onAction={() => exec("insertUnorderedList")}>☰</ToolButton>
        <ToolButton label="Highlight" onAction={() => style({ backgroundColor: HIGHLIGHT_BG, color: HIGHLIGHT_FG })}>
          <span style={{ background: HIGHLIGHT_BG, color: HIGHLIGHT_FG, padding: "0 3px", borderRadius: 2 }}>H</span>
        </ToolButton>
        <ToolButton label="Clear formatting" onAction={() => exec("removeFormat")}>✕</ToolButton>
        <span className="mx-1 h-4 w-px bg-line" />
        {FONT_SIZES.map((f) => (
          <ToolButton key={f.label} label={`Font size ${f.label}`} onAction={() => style({ fontSize: f.size })}>
            {f.label}
          </ToolButton>
        ))}
        <span className="mx-1 h-4 w-px bg-line" />
        {FONT_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label="Font color"
            onMouseDown={(e) => { e.preventDefault(); style({ color: c }); }}
            className="pressable h-6 w-6 shrink-0 rounded-full border border-line-soft"
            style={{ background: c }}
          />
        ))}
      </div>
      <div className="relative">
        {empty && placeholder && (
          <span className="pointer-events-none absolute left-3.5 top-3 text-[0.95rem] text-ink-3">
            {placeholder}
          </span>
        )}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onPaste={(e) => {
            // external HTML (Word, Google Docs, a webpage) never enters —
            // only this toolbar's own formatting does
            e.preventDefault();
            document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
          }}
          className={`w-full ${minHeightClass} overflow-y-auto rounded-xl border border-line bg-bg px-3.5 py-3 text-[0.95rem] leading-relaxed text-ink outline-none focus:border-accent [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mb-1`}
        />
      </div>
    </div>
  );
}

function ToolButton({
  label, onAction, children,
}: { label: string; onAction: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onMouseDown={(e) => { e.preventDefault(); onAction(); }}
      className="pressable grid h-7 w-7 shrink-0 place-items-center rounded-lg text-sm font-medium text-ink-2 hover:bg-surface-2"
    >
      {children}
    </button>
  );
}
