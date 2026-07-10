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

/** The browser normalizes any color you set (hex, name…) to `rgb(r, g, b)`
 *  when you read it back — cache that normalized form once so live
 *  selection state can be compared against it directly. */
function normalizeColor(raw: string): string {
  const probe = document.createElement("div");
  probe.style.color = raw;
  return probe.style.color;
}

/** Wraps the current (non-collapsed) selection in a styled span — used for
 *  font size, which execCommand can't do at arbitrary values. Falls back to
 *  extract+wrap when the selection crosses element boundaries. */
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

/** Nothing is selected — insert an empty styled span with a caret parked
 *  inside it, so whatever gets typed next inherits the style. Standard
 *  contentEditable trick for "choose a format, then type" without a
 *  selection to wrap. */
function insertCollapsedStyle(style: Partial<CSSStyleDeclaration>) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  const span = document.createElement("span");
  Object.assign(span.style, style);
  const zwsp = document.createTextNode("​");
  span.appendChild(zwsp);
  range.deleteContents();
  range.insertNode(span);
  const next = document.createRange();
  next.setStart(zwsp, 1);
  next.collapse(true);
  sel.removeAllRanges();
  sel.addRange(next);
}

/** Walks up from the selection anchor looking for the nearest ancestor
 *  (within `root`) with its own inline value for `prop` — used to light up
 *  the toolbar to match whatever the caret is currently sitting inside. */
function inlineStyleAt(root: HTMLElement, prop: "backgroundColor" | "color" | "fontSize"): string {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return "";
  let node: Node | null = sel.anchorNode;
  while (node && node !== root.parentNode) {
    if (node instanceof HTMLElement) {
      const v = node.style[prop];
      if (v) return v;
    }
    node = node.parentNode;
  }
  return "";
}

interface Format {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  highlight: boolean;
  size: string;
  color: string;
}

const NO_FORMAT: Format = { bold: false, italic: false, underline: false, highlight: false, size: "", color: "" };

/**
 * Minimal rich-text editor: contentEditable + the browser's own execCommand
 * for bold/italic/underline/bullets/highlight/font-color (zero dependencies,
 * and all of them support picking a format before typing, same as a native
 * editor), plus a small span-wrapping helper for font size, which
 * execCommand can't do at arbitrary values. The toolbar reflects whatever
 * the caret is currently sitting inside. Uncontrolled by design — content
 * is written to the DOM directly and read back on input, never re-rendered
 * from React state on every keystroke, so the caret never jumps mid-type.
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
  const [format, setFormat] = useState<Format>(NO_FORMAT);
  // normalized once on the client, where colors round-trip through the DOM
  // consistently — never touched during SSR, where there's no DOM to ask
  const [highlightRgb] = useState(() => (typeof document === "undefined" ? "" : normalizeColor(HIGHLIGHT_BG)));
  const [colorRgb] = useState(() => (
    typeof document === "undefined" ? [] : FONT_COLORS.map(normalizeColor)
  ));

  useEffect(() => {
    if (ref.current && value !== lastValue.current && document.activeElement !== ref.current) {
      ref.current.innerHTML = value;
      lastValue.current = value;
      setEmpty(!value.trim());
    }
  }, [value]);

  useEffect(() => {
    const updateFormat = () => {
      const el = ref.current;
      if (!el) return;
      const sel = window.getSelection();
      if (!sel || !sel.anchorNode || !el.contains(sel.anchorNode)) return;
      const bg = inlineStyleAt(el, "backgroundColor");
      const color = inlineStyleAt(el, "color");
      setFormat({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
        highlight: !!bg && bg === highlightRgb,
        size: inlineStyleAt(el, "fontSize"),
        color: colorRgb.includes(color) ? color : "",
      });
    };
    document.addEventListener("selectionchange", updateFormat);
    return () => document.removeEventListener("selectionchange", updateFormat);
  }, [colorRgb, highlightRgb]);

  const handleInput = () => {
    if (!ref.current) return;
    lastValue.current = ref.current.innerHTML;
    setEmpty(!ref.current.textContent?.trim());
    onChange(ref.current.innerHTML);
  };

  const exec = (cmd: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand(cmd, false, arg);
    handleInput();
  };

  const style = (s: Partial<CSSStyleDeclaration>) => {
    ref.current?.focus();
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) wrapSelection(s);
    else insertCollapsedStyle(s);
    handleInput();
  };

  const highlight = () => {
    ref.current?.focus();
    document.execCommand("styleWithCSS", false, "true");
    // pair a fixed dark foreground with the highlight — the app's default
    // text color is near-white for dark mode, invisible on pale yellow
    document.execCommand("hiliteColor", false, HIGHLIGHT_BG);
    document.execCommand("foreColor", false, HIGHLIGHT_FG);
    handleInput();
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1">
        <ToolButton label="Bold" active={format.bold} onAction={() => exec("bold")}><b>B</b></ToolButton>
        <ToolButton label="Italic" active={format.italic} onAction={() => exec("italic")}><i>I</i></ToolButton>
        <ToolButton label="Underline" active={format.underline} onAction={() => exec("underline")}><u>U</u></ToolButton>
        <ToolButton label="Bullet list" onAction={() => exec("insertUnorderedList")}>☰</ToolButton>
        <ToolButton
          label="Highlight"
          active={format.highlight}
          onAction={highlight}
        >
          <span style={{ background: HIGHLIGHT_BG, color: HIGHLIGHT_FG, padding: "0 3px", borderRadius: 2 }}>H</span>
        </ToolButton>
        <ToolButton label="Clear formatting" onAction={() => exec("removeFormat")}>✕</ToolButton>
        <span className="mx-1 h-4 w-px bg-line" />
        {FONT_SIZES.map((f) => (
          <ToolButton
            key={f.label}
            label={`Font size ${f.label}`}
            active={format.size === f.size}
            onAction={() => style({ fontSize: f.size })}
          >
            {f.label}
          </ToolButton>
        ))}
        <span className="mx-1 h-4 w-px bg-line" />
        {FONT_COLORS.map((c, i) => (
          <button
            key={c}
            type="button"
            aria-label="Font color"
            onMouseDown={(e) => { e.preventDefault(); exec("foreColor", c); }}
            className={`pressable h-6 w-6 shrink-0 rounded-full border-2 ${
              format.color === colorRgb[i] ? "border-ink" : "border-line-soft"
            }`}
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
  label, onAction, children, active,
}: { label: string; onAction: () => void; children: React.ReactNode; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onMouseDown={(e) => { e.preventDefault(); onAction(); }}
      className={`pressable grid h-7 w-7 shrink-0 place-items-center rounded-lg text-sm font-medium transition-colors ${
        active ? "bg-accent-soft text-accent-deep" : "text-ink-2 hover:bg-surface-2"
      }`}
    >
      {children}
    </button>
  );
}
