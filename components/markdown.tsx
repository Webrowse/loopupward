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

export function mdToHtml(md: string): string {
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  let quote = false;
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  const closeQuote = () => { if (quote) { out.push("</blockquote>"); quote = false; } };

  for (const line of md.split(/\r?\n/)) {
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
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ol) {
      closeQuote();
      if (list !== "ol") { closeList(); out.push("<ol>"); list = "ol"; }
      out.push(`<li>${inlineMd(escapeHtml(ol[1]))}</li>`);
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
  "[&_hr]:my-2 [&_hr]:border-line-soft [&_a]:text-accent-deep [&_a]:underline [&_a]:underline-offset-2";

export function MarkdownView({ md, className = "" }: { md: string; className?: string }) {
  return (
    <div
      className={`${MD_PROSE_CLS} ${className}`}
      dangerouslySetInnerHTML={{ __html: mdToHtml(md) }}
    />
  );
}

/**
 * Two panes, one truth: markdown source on one side, its preview on the
 * other. Desktop shows both side by side; on a phone, Write and Preview
 * are tabs on the same screen.
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
      {/* phone: tab switch; desktop: both panes visible, labels instead */}
      <div className="mb-2 flex items-center gap-1.5 lg:hidden">
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
      <div className="hidden lg:grid lg:grid-cols-2 lg:gap-3 mb-1.5 text-[0.7rem] font-medium uppercase tracking-wide text-ink-3">
        <span>Write</span>
        <span>Preview</span>
      </div>

      <div className="lg:grid lg:grid-cols-2 lg:gap-3 lg:items-stretch">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          spellCheck={false}
          className={`${paneCls} resize-y font-mono text-[0.88rem] leading-relaxed text-ink outline-none focus:border-accent ${
            tab === "write" ? "" : "hidden"
          } lg:block`}
        />
        <div className={`${paneCls} ${tab === "preview" ? "" : "hidden"} lg:block`}>
          {value.trim() ? (
            <MarkdownView md={value} />
          ) : (
            <p className="text-sm text-ink-3">Nothing to preview yet.</p>
          )}
        </div>
      </div>

      <p className="mt-1.5 text-[0.7rem] text-ink-3">
        Markdown: # heading · - list · 1. numbered · &gt; quote · **bold** · *italic* · `code` · [link](https://…)
      </p>
    </div>
  );
}
