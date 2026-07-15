"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const HIGHLIGHT_BG = "#fef08a";
const HIGHLIGHT_FG = "#1a1a1a";
const FONT_SIZES = [
  { label: "S", size: "0.85rem" },
  { label: "M", size: "1rem" },
  { label: "L", size: "1.25rem" },
  { label: "XL", size: "1.6rem" },
];
const FONT_COLORS = ["#211e19", "#b4543e", "#c07423", "#3d7a50", "#2a5e8f"];
const FONT_COLOR_NAMES = ["Ink", "Brick red", "Amber", "Moss green", "Blue"];

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

/** Same idea as `insertCollapsedStyle`, but for escaping an inline style
 *  the caret is currently sitting inside rather than adding one: a plain
 *  `range.insertNode` at a collapsed caret lands *inside* the enclosing
 *  span (splitting its text node), so a "transparent" override just lets
 *  the ancestor's own background show through instead of clearing it.
 *  This instead walks up to that nearest styled `<span>` and inserts the
 *  fresh span as its next sibling, so new typing sits outside it entirely. */
function insertAfterEnclosingSpan(root: HTMLElement, style: Partial<CSSStyleDeclaration>) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  let node: Node | null = sel.anchorNode;
  let enclosing: HTMLElement | null = null;
  while (node && node !== root.parentNode) {
    if (node instanceof HTMLElement && node.tagName === "SPAN") {
      enclosing = node;
      break;
    }
    node = node.parentNode;
  }
  const span = document.createElement("span");
  Object.assign(span.style, style);
  const zwsp = document.createTextNode("​");
  span.appendChild(zwsp);
  if (enclosing?.parentNode) {
    enclosing.parentNode.insertBefore(span, enclosing.nextSibling);
  } else {
    sel.getRangeAt(0).insertNode(span);
  }
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

/* ————— markdown-style shortcuts ————— */

/** Typed at the start of a line, then space: becomes the real block. */
const MD_BLOCKS: Record<string, "h1" | "h2" | "h3" | "blockquote" | "ul" | "ol"> = {
  "#": "h1",
  "##": "h2",
  "###": "h3",
  ">": "blockquote",
  "-": "ul",
  "*": "ul",
  "1.": "ol",
};

/** Inline patterns converted the moment their closing marker is typed.
 *  The italic rule keeps one char of left context (group 1) to make sure a
 *  lone `*` isn't actually the tail of a `**` — the regexes avoid lookbehind
 *  for older-Safari compatibility. */
const MD_INLINE: { re: RegExp; tag: "b" | "i" | "code"; context: boolean }[] = [
  { re: /\*\*([^*\s](?:[^*]*[^*\s])?)\*\*$/, tag: "b", context: false },
  { re: /(^|[^*`])\*([^*\s](?:[^*]*[^*\s])?)\*$/, tag: "i", context: true },
  { re: /`([^`\s](?:[^`]*[^`\s])?)`$/, tag: "code", context: false },
];

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

  const updateFormat = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const sel = window.getSelection();
    if (!sel || !sel.anchorNode || !el.contains(sel.anchorNode)) return;
    // queryCommandValue reflects the pending style for a collapsed caret
    // (the same reason queryCommandState works for bold before you type),
    // where the DOM has no span yet to walk up and inspect
    let bg = "";
    let color = "";
    try {
      // "hiliteColor" applies cleanly but queryCommandValue can't read it back
      // (returns empty) — "backColor" is the readable alias for the same style
      bg = document.queryCommandValue("backColor");
      color = document.queryCommandValue("foreColor");
    } catch {
      // some engines don't support these two — fall through to the DOM walk
    }
    if (!bg) bg = inlineStyleAt(el, "backgroundColor");
    if (!color) color = inlineStyleAt(el, "color");
    setFormat({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      underline: document.queryCommandState("underline"),
      highlight: bg === highlightRgb,
      size: inlineStyleAt(el, "fontSize"),
      color: colorRgb.includes(color) ? color : "",
    });
  }, [colorRgb, highlightRgb]);

  useEffect(() => {
    document.addEventListener("selectionchange", updateFormat);
    return () => document.removeEventListener("selectionchange", updateFormat);
  }, [updateFormat]);

  /** `**bold**`, `*italic*`, `` `code` `` become real formatting the moment
   *  the closing marker is typed. Runs on every input, but bails instantly
   *  unless the text right before the caret matches a complete pattern. */
  const applyInlineMarkdown = () => {
    const el = ref.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0 || !sel.isCollapsed) return;
    const node = sel.anchorNode;
    if (!node || node.nodeType !== Node.TEXT_NODE || !el.contains(node)) return;
    // never re-transform inside something already converted
    if (node.parentElement?.closest("b,i,code,strong,em")) return;
    const upTo = (node.textContent ?? "").slice(0, sel.anchorOffset);
    for (const rule of MD_INLINE) {
      const m = rule.re.exec(upTo);
      if (!m) continue;
      const inner = rule.context ? m[2] : m[1];
      const consumed = rule.context ? m[0].length - m[1].length : m[0].length;
      const range = document.createRange();
      range.setStart(node, sel.anchorOffset - consumed);
      range.setEnd(node, sel.anchorOffset);
      range.deleteContents();
      const wrap = document.createElement(rule.tag);
      wrap.textContent = inner;
      range.insertNode(wrap);
      // park the caret just past the element so typing continues unstyled
      const after = document.createTextNode("​");
      wrap.parentNode?.insertBefore(after, wrap.nextSibling);
      const caret = document.createRange();
      caret.setStart(after, 1);
      caret.collapse(true);
      sel.removeAllRanges();
      sel.addRange(caret);
      // the caret escaped the element, but the browser's own "next typed
      // character" style still carries it — without this, everything typed
      // after **bold** stays bold, including whole new lines
      if (rule.tag === "b" && document.queryCommandState("bold")) document.execCommand("bold");
      if (rule.tag === "i" && document.queryCommandState("italic")) document.execCommand("italic");
      return;
    }
  };

  const handleInput = () => {
    if (!ref.current) return;
    applyInlineMarkdown();
    lastValue.current = ref.current.innerHTML;
    setEmpty(!ref.current.textContent?.trim());
    onChange(ref.current.innerHTML);
  };

  /** Space after a line-opening `#`/`##`/`###`/`-`/`*`/`1.`/`>` turns the
   *  line into the block it names; Enter at the end of a heading or quote
   *  steps back out to plain text, the way every markdown editor behaves. */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const el = ref.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0 || !sel.isCollapsed) return;

    if (e.key === " ") {
      const node = sel.anchorNode;
      if (!node || node.nodeType !== Node.TEXT_NODE) return;
      // find the line this caret sits on: the editor root itself (a bare
      // first line) or a direct div/p child. Headings, quotes and list
      // items never re-convert.
      let line: HTMLElement | null = node.parentElement;
      while (line && line !== el && line.parentElement !== el) line = line.parentElement;
      if (!line) return;
      if (line !== el && line.tagName !== "DIV" && line.tagName !== "P") return;
      // everything on the line up to the caret must be exactly the marker —
      // ignoring the zero-width spacers inline conversions leave behind
      const range = document.createRange();
      range.selectNodeContents(line);
      range.setEnd(node, sel.anchorOffset);
      const tag = MD_BLOCKS[range.toString().replace(/​/g, "")];
      if (!tag) return;
      e.preventDefault();
      range.deleteContents();
      // build the block by hand — execCommand's own list/heading conversion
      // likes to merge neighboring lines and drags their inline styles along
      const isList = tag === "ul" || tag === "ol";
      const inner = document.createElement(isList ? "li" : tag);
      if (line !== el) {
        while (line.firstChild) inner.appendChild(line.firstChild);
      }
      if (!inner.textContent?.replace(/​/g, "")) {
        inner.textContent = "";
        inner.appendChild(document.createElement("br"));
      }
      const blockNode = isList ? document.createElement(tag) : inner;
      if (isList) blockNode.appendChild(inner);
      if (line === el) el.insertBefore(blockNode, el.firstChild);
      else line.replaceWith(blockNode);
      const caret = document.createRange();
      caret.selectNodeContents(inner);
      caret.collapse(true);
      sel.removeAllRanges();
      sel.addRange(caret);
      // a fresh element, a fresh start: any lingering bold/italic typing
      // state from earlier on the line must not leak into the new block
      if (document.queryCommandState("bold")) document.execCommand("bold");
      if (document.queryCommandState("italic")) document.execCommand("italic");
      handleInput();
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      let n: Node | null = sel.anchorNode;
      let container: HTMLElement | null = null;
      while (n && n !== el) {
        if (n instanceof HTMLElement && /^(H1|H2|H3|BLOCKQUOTE)$/.test(n.tagName)) {
          container = n;
          break;
        }
        n = n.parentNode;
      }
      if (!container) return;
      const tail = document.createRange();
      tail.selectNodeContents(container);
      tail.setStart(sel.getRangeAt(0).endContainer, sel.getRangeAt(0).endOffset);
      if (tail.toString().replace(/​/g, "") !== "") return; // mid-block Enter stays native
      e.preventDefault();
      const line = document.createElement("div");
      line.appendChild(document.createElement("br"));
      container.insertAdjacentElement("afterend", line);
      const caret = document.createRange();
      caret.setStart(line, 0);
      caret.collapse(true);
      sel.removeAllRanges();
      sel.addRange(caret);
      handleInput();
    }
  };

  // toggling bold/italic/underline/color on a collapsed caret changes the
  // browser's internal "next typed character" style without moving the
  // selection at all, so no selectionchange event fires — the toolbar would
  // otherwise only catch up once the user actually typed something
  const exec = (cmd: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand(cmd, false, arg);
    handleInput();
    updateFormat();
  };

  const style = (s: Partial<CSSStyleDeclaration>) => {
    ref.current?.focus();
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) wrapSelection(s);
    else insertCollapsedStyle(s);
    handleInput();
    updateFormat();
  };

  const highlight = () => {
    ref.current?.focus();
    const sel = window.getSelection();
    const collapsed = !sel || sel.rangeCount === 0 || sel.isCollapsed;
    if (format.highlight && collapsed && ref.current) {
      // the caret sits inside an existing highlight span, so execCommand
      // has nothing to "unwrap" for a collapsed selection and future
      // typing just stays inside it — and inserting a plain "transparent"
      // span here would only nest inside the highlight, leaving its yellow
      // showing through. Escape to a sibling span after it instead.
      insertAfterEnclosingSpan(ref.current, { backgroundColor: "transparent", color: "inherit" });
      handleInput();
      updateFormat();
      return;
    }
    document.execCommand("styleWithCSS", false, "true");
    if (format.highlight) {
      // turning off a real selection: execCommand can unwrap this fine
      document.execCommand("hiliteColor", false, "transparent");
      document.execCommand("foreColor", false, "inherit");
    } else {
      // pair a fixed dark foreground with the highlight — the app's default
      // text color is near-white for dark mode, invisible on pale yellow
      document.execCommand("hiliteColor", false, HIGHLIGHT_BG);
      document.execCommand("foreColor", false, HIGHLIGHT_FG);
    }
    handleInput();
    updateFormat();
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
            aria-label={`Text color: ${FONT_COLOR_NAMES[i]}`}
            aria-pressed={format.color === colorRgb[i]}
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
          onKeyDown={handleKeyDown}
          onPaste={(e) => {
            // external HTML (Word, Google Docs, a webpage) never enters —
            // only this toolbar's own formatting does
            e.preventDefault();
            document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
          }}
          className={`w-full ${minHeightClass} overflow-y-auto rounded-xl border border-line bg-bg px-3.5 py-3 text-[0.95rem] leading-relaxed text-ink outline-none focus:border-accent [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1 [&_h1]:font-display [&_h1]:text-[1.45rem] [&_h1]:leading-snug [&_h1]:mt-3 [&_h1]:mb-1 [&_h2]:font-display [&_h2]:text-[1.2rem] [&_h2]:leading-snug [&_h2]:mt-2.5 [&_h2]:mb-1 [&_h3]:text-[1.02rem] [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-0.5 [&_blockquote]:border-l-2 [&_blockquote]:border-line [&_blockquote]:pl-3 [&_blockquote]:my-1 [&_blockquote]:text-ink-2 [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]`}
        />
      </div>
      <p className="mt-1.5 text-[0.7rem] text-ink-3">
        Markdown works: # heading · - list · &gt; quote · **bold** · *italic* · `code`
      </p>
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
      className={`pressable grid h-7 w-7 shrink-0 place-items-center rounded-lg border text-sm font-medium transition-colors ${
        active ? "border-accent bg-accent-soft text-accent-deep" : "border-transparent text-ink-2 hover:bg-surface-2"
      }`}
    >
      {children}
    </button>
  );
}
