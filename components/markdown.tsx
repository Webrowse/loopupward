"use client";

import { useState } from "react";

/**
 * Notes are written as plain markdown text and rendered to HTML with the
 * tiny deterministic renderer below — no library, no surprises. Notes
 * saved by the old rich-text editor still open fine: their HTML is
 * converted to markdown once, the first time they're edited.
 */

/* ————— markdown → HTML ————— */

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Inline spans: `code` first (its contents stay literal), then bold,
 *  italic, strike, links. Input arrives already HTML-escaped. */
function inlineMd(escaped: string): string {
  return escaped
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<i>$2</i>")
    .replace(/~~([^~]+)~~/g, "<s>$1</s>")
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer">$1</a>'
    );
}

/** Split a table row on its pipes. Hand-scanned rather than a regex with a
 *  lookbehind, so an escaped \| stays literal without needing a feature that
 *  older mobile Safari would throw a syntax error on. The empty cells a
 *  leading or trailing pipe creates are dropped. */
function tableCells(row: string): string[] {
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === "\\" && row[i + 1] === "|") { cur += "|"; i++; continue; }
    if (ch === "|") { cells.push(cur); cur = ""; continue; }
    cur += ch;
  }
  cells.push(cur);
  if (cells.length > 1 && cells[0].trim() === "") cells.shift();
  if (cells.length > 1 && cells[cells.length - 1].trim() === "") cells.pop();
  return cells.map((c) => c.trim());
}

/** The `|---|:--:|---:|` line under a table's header, which is what tells a
 *  row of pipes from a paragraph that merely contains one. */
function isTableDelimiter(line: string): boolean {
  if (!line.includes("-")) return false;
  const cells = tableCells(line);
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
}

function alignOf(cell: string): string {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  if (left && right) return ' style="text-align:center"';
  if (right) return ' style="text-align:right"';
  if (left) return ' style="text-align:left"';
  return "";
}

export function mdToHtml(md: string): string {
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  let quote = false;
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  const closeQuote = () => { if (quote) { out.push("</blockquote>"); quote = false; } };

  const lines = md.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // fenced code: everything until the closing fence stays literal
    const fence = /^\s*(`{3,}|~{3,})\s*([\w+#-]*)\s*$/.exec(line);
    if (fence) {
      closeList(); closeQuote();
      const marker = fence[1][0];
      const body: string[] = [];
      let j = i + 1;
      while (j < lines.length && !new RegExp(`^\\s*${marker === "`" ? "`" : "~"}{3,}\\s*$`).test(lines[j])) {
        body.push(lines[j]);
        j++;
      }
      out.push(`<pre><code>${escapeHtml(body.join("\n"))}</code></pre>`);
      i = j; // the closing fence, or the end of the note
      continue;
    }

    // a table is a row of pipes whose next line is the |---|---| divider;
    // without that check every sentence containing a pipe becomes a table
    if (line.includes("|") && i + 1 < lines.length && isTableDelimiter(lines[i + 1])) {
      closeList(); closeQuote();
      const head = tableCells(line);
      const align = tableCells(lines[i + 1]).map(alignOf);
      const rows: string[][] = [];
      let j = i + 2;
      while (j < lines.length && lines[j].includes("|") && lines[j].trim()) {
        rows.push(tableCells(lines[j]));
        j++;
      }
      const cell = (tag: string, text: string, k: number) =>
        `<${tag}${align[k] ?? ""}>${inlineMd(escapeHtml(text ?? ""))}</${tag}>`;
      const body = rows
        .map((r) => `<tr>${head.map((_, k) => cell("td", r[k] ?? "", k)).join("")}</tr>`)
        .join("");
      // the wrapper scrolls: a wide table must not push the page sideways
      out.push(
        `<div class="md-table"><table><thead><tr>${head
          .map((h, k) => cell("th", h, k))
          .join("")}</tr></thead><tbody>${body}</tbody></table></div>`
      );
      i = j - 1;
      continue;
    }

    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      closeList(); closeQuote();
      const level = h[1].length;
      out.push(`<h${level}>${inlineMd(escapeHtml(h[2]))}</h${level}>`);
      continue;
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) { closeList(); closeQuote(); out.push("<hr>"); continue; }
    const ul = /^\s*[-*]\s+(.*)$/.exec(line);
    if (ul) {
      closeQuote();
      if (list !== "ul") { closeList(); out.push("<ul>"); list = "ul"; }
      out.push(`<li>${inlineMd(escapeHtml(ul[1]))}</li>`);
      continue;
    }
    const ol = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
    if (ol) {
      closeQuote();
      if (list !== "ol") { closeList(); out.push("<ol>"); list = "ol"; }
      // keep the author's own number: a sublist or a plain line between two
      // numbered items splits the run into separate <ol>s, each of which would
      // otherwise restart at 1 — so "2." would wrongly render as "1."
      out.push(`<li value="${ol[1]}">${inlineMd(escapeHtml(ol[2]))}</li>`);
      continue;
    }
    const q = /^>\s?(.*)$/.exec(line);
    if (q) {
      closeList();
      if (!quote) { out.push("<blockquote>"); quote = true; }
      out.push(`<p>${inlineMd(escapeHtml(q[1]))}</p>`);
      continue;
    }
    closeList(); closeQuote();
    if (line.trim()) out.push(`<p>${inlineMd(escapeHtml(line))}</p>`);
  }
  closeList(); closeQuote();
  return out.join("\n");
}

/* ————— legacy rich-text HTML → markdown ————— */

/** Did this body come from the old contentEditable editor? Plain markdown
 *  never contains these tags. */
export function isLegacyHtml(body: string | null | undefined): boolean {
  return !!body && /<(b|i|u|s|em|strong|div|p|br|ul|ol|li|h1|h2|h3|blockquote|span|code|a)[\s/>]/i.test(body);
}

function nodeToMd(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent ?? "").replace(/​/g, "").replace(/ /g, " ");
  }
  if (!(node instanceof HTMLElement)) return "";
  const kids = () => Array.from(node.childNodes).map(nodeToMd).join("");
  const wrap = (marker: string) => {
    const t = kids().trim();
    return t ? `${marker}${t}${marker}` : "";
  };
  switch (node.tagName) {
    case "B": case "STRONG": return wrap("**");
    case "I": case "EM": return wrap("*");
    case "S": case "STRIKE": case "DEL": return wrap("~~");
    case "CODE": return wrap("`");
    case "H1": return `\n# ${kids().trim()}\n`;
    case "H2": return `\n## ${kids().trim()}\n`;
    case "H3": return `\n### ${kids().trim()}\n`;
    case "BLOCKQUOTE": {
      const t = kids().trim();
      return t ? "\n" + t.split("\n").map((l) => `> ${l}`).join("\n") + "\n" : "";
    }
    case "UL":
      return "\n" + Array.from(node.children).map((li) => `- ${nodeToMd(li).trim()}`).join("\n") + "\n";
    case "OL":
      return "\n" + Array.from(node.children).map((li, i) => `${i + 1}. ${nodeToMd(li).trim()}`).join("\n") + "\n";
    case "LI": return kids();
    case "BR": return "\n";
    case "HR": return "\n---\n";
    case "DIV": case "P": return "\n" + kids() + "\n";
    case "A": {
      const t = kids().trim();
      const href = node.getAttribute("href");
      return href && t ? `[${t}](${href})` : t;
    }
    default:
      // spans carrying font size/color/highlight, <u>… — markdown has no
      // equivalent, the words themselves survive
      return kids();
  }
}

export function htmlToMd(html: string): string {
  if (typeof window === "undefined") return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  return nodeToMd(doc.body).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/* ————— plain-text snippet for note cards ————— */

/** Regex-only (SSR-safe): works for both markdown bodies and legacy HTML
 *  ones, and never leaks tags or entities like &nbsp; into the card. */
export function noteSnippet(body: string | null | undefined): string {
  if (!body) return "";
  return body
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/^#{1,3}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)\s]+\)/g, "$1")
    // table plumbing reads as noise in a one-line preview: the divider row
    // goes entirely, then the remaining pipes fall back to spaces
    .replace(/^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/gm, " ")
    .replace(/\|/g, " ")
    .replace(/^\s*(```+|~~~+).*$/gm, " ")
    .replace(/(\*\*|\*|~~|`|​)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* ————— the editor: write markdown, see it rendered ————— */

/** Styling for rendered markdown — one place, used by the preview pane and
 *  anywhere else a note body is displayed. */
export const MD_PROSE_CLS =
  "text-[0.95rem] leading-relaxed text-ink " +
  "[&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1 [&_li]:mb-1 " +
  "[&_h1]:font-display [&_h1]:text-[1.45rem] [&_h1]:leading-snug [&_h1]:mt-3 [&_h1]:mb-1 " +
  "[&_h2]:font-display [&_h2]:text-[1.2rem] [&_h2]:leading-snug [&_h2]:mt-2.5 [&_h2]:mb-1 " +
  "[&_h3]:text-[1.02rem] [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-0.5 " +
  "[&_blockquote]:border-l-2 [&_blockquote]:border-line [&_blockquote]:pl-3 [&_blockquote]:my-1 [&_blockquote]:text-ink-2 " +
  "[&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] " +
  "[&_hr]:my-2 [&_hr]:border-line-soft [&_a]:text-accent-deep [&_a]:underline [&_a]:underline-offset-2 " +
  // a code block is one box, so the inline pill styling has to come back off
  "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-line-soft " +
  "[&_pre]:bg-surface-2 [&_pre]:p-3 [&_pre]:text-[0.82rem] [&_pre]:leading-relaxed " +
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[inherit] " +
  // the wrapper scrolls on its own so a wide table never widens the page
  "[&_.md-table]:my-2 [&_.md-table]:overflow-x-auto [&_.md-table]:rounded-xl [&_.md-table]:border [&_.md-table]:border-line-soft " +
  "[&_table]:w-full [&_table]:border-collapse [&_table]:text-[0.88rem] " +
  "[&_th]:border-b [&_th]:border-line [&_th]:bg-surface-2 [&_th]:px-2.5 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold [&_th]:whitespace-nowrap " +
  "[&_td]:border-b [&_td]:border-line-soft [&_td]:px-2.5 [&_td]:py-1.5 [&_td]:align-top " +
  "[&_tr:last-child_td]:border-b-0";

export function MarkdownView({ md, className = "" }: { md: string; className?: string }) {
  return (
    <div
      className={`${MD_PROSE_CLS} ${className}`}
      dangerouslySetInnerHTML={{ __html: mdToHtml(md) }}
    />
  );
}

/** Compact rendered-markdown for note cards: real formatting, shrunk down
 *  and muted so it reads as a preview, not the note itself. */
const MD_CARD_CLS =
  "text-[0.8rem] leading-relaxed text-ink-2 " +
  "[&_p]:my-0.5 [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:my-0.5 [&_li]:mb-0.5 " +
  "[&_h1]:text-[0.86rem] [&_h1]:font-semibold [&_h1]:my-0.5 " +
  "[&_h2]:text-[0.83rem] [&_h2]:font-semibold [&_h2]:my-0.5 " +
  "[&_h3]:text-[0.81rem] [&_h3]:font-semibold [&_h3]:my-0.5 " +
  "[&_blockquote]:border-l-2 [&_blockquote]:border-line [&_blockquote]:pl-2 [&_blockquote]:my-0.5 " +
  "[&_code]:font-mono [&_code]:text-[0.75rem] [&_hr]:my-1 [&_hr]:border-line-soft " +
  "[&_a]:text-accent-deep [&_a]:underline [&_a]:underline-offset-2 " +
  "[&_pre]:my-1 [&_pre]:overflow-hidden [&_pre]:rounded-lg [&_pre]:bg-surface-2 [&_pre]:p-1.5 [&_pre]:text-[0.72rem] " +
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0 " +
  "[&_.md-table]:my-1 [&_.md-table]:overflow-hidden [&_table]:w-full [&_table]:text-[0.72rem] " +
  "[&_th]:px-1 [&_th]:py-0.5 [&_th]:text-left [&_th]:font-semibold [&_td]:px-1 [&_td]:py-0.5";

/** A note's body rendered small for its card. Handles legacy HTML bodies
 *  (converts them to markdown first) and renders nothing for an empty note.
 *  Non-interactive, so tapping a link never steals the card's own tap. */
export function NotePreview({ body, className = "" }: { body: string | null | undefined; className?: string }) {
  const md = isLegacyHtml(body) ? htmlToMd(body ?? "") : (body ?? "");
  if (!md.trim()) return null;
  return (
    <div
      className={`${MD_CARD_CLS} pointer-events-none ${className}`}
      dangerouslySetInnerHTML={{ __html: mdToHtml(md) }}
    />
  );
}

/**
 * One window, GitHub-style: write markdown in a single box, hit Preview to
 * see it rendered in that same space, Write to go back. Same on phone and
 * desktop — no side-by-side split.
 */
export function MarkdownEditor({
  value, onChange, placeholder, minHeightClass = "min-h-40",
}: {
  value: string;
  onChange: (md: string) => void;
  placeholder?: string;
  minHeightClass?: string;
}) {
  const [tab, setTab] = useState<"write" | "preview">("write");

  const paneCls = `w-full ${minHeightClass} overflow-y-auto rounded-xl border border-line bg-bg px-3.5 py-3`;

  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5">
        {(["write", "preview"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`pressable rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              tab === t ? "border-accent bg-accent-soft text-accent-deep" : "border-line bg-surface text-ink-2"
            }`}
          >
            {t === "write" ? "Write" : "Preview"}
          </button>
        ))}
      </div>

      {tab === "write" ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          spellCheck={false}
          className={`${paneCls} resize-y font-mono text-[0.88rem] leading-relaxed text-ink outline-none focus:border-accent`}
        />
      ) : (
        <div className={paneCls}>
          {value.trim() ? (
            <MarkdownView md={value} />
          ) : (
            <p className="text-sm text-ink-3">Nothing to preview yet.</p>
          )}
        </div>
      )}

      <p className="mt-1.5 text-[0.7rem] text-ink-3">
        Markdown: # heading · - list · 1. numbered · &gt; quote · **bold** · *italic* · `code` · [link](https://…)
        {" · tables (a |---|---| line under the header row) · ``` for a code block"}
      </p>
    </div>
  );
}
