import { describe, expect, it } from "vitest";
import { mdToHtml, noteSnippet, toggleTaskInMd } from "@/components/markdown";

/** Rendered HTML with newlines flattened, since the renderer joins blocks with
 *  them and no test here cares where they fall. */
const html = (md: string) => mdToHtml(md).replace(/\n/g, "");

describe("blocks", () => {
  it("renders headings to h6 and setext underlines", () => {
    expect(html("# one")).toBe("<h1>one</h1>");
    expect(html("###### six")).toBe("<h6>six</h6>");
    expect(html("Title\n=====")).toBe("<h1>Title</h1>");
    expect(html("Sub\n---")).toBe("<h2>Sub</h2>");
  });

  it("keeps a lone rule a rule", () => {
    expect(html("above\n\n---\n\nbelow")).toBe("<p>above</p><hr><p>below</p>");
    expect(html("***")).toBe("<hr>");
  });

  it("keeps an author's own numbering", () => {
    expect(html("3. three\n4. four")).toContain('<li value="3">three');
  });

  it("nests lists by indent and closes them in order", () => {
    expect(html("- a\n  - b\n- c")).toBe("<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>");
  });

  it("nests an ordered list inside an unordered one", () => {
    expect(html("- a\n  1. one")).toBe('<ul><li>a<ol><li value="1">one</li></ol></li></ul>');
  });

  it("starts a new list when the marker type changes at one depth", () => {
    expect(html("- a\n1. b")).toBe('<ul><li>a</li></ul><ol><li value="1">b</li></ol>');
  });

  it("continues an item across an indented line", () => {
    expect(html("- a\n  more")).toBe("<ul><li>a<br>more</li></ul>");
  });

  it("renders a blockquote as one block", () => {
    expect(html("> a\n> b")).toBe("<blockquote><p>a</p><p>b</p></blockquote>");
  });

  it("keeps fenced code literal, closing an unclosed fence at the end", () => {
    expect(html("```js\nlet a = 1 < 2;\n```")).toBe("<pre><code>let a = 1 &lt; 2;</code></pre>");
    expect(html("```\nunclosed")).toBe("<pre><code>unclosed</code></pre>");
  });
});

describe("tables", () => {
  it("renders a header, a divider and body rows", () => {
    expect(html("| a | b |\n|---|---|\n| 1 | 2 |")).toBe(
      '<div class="md-table"><table><thead><tr><th>a</th><th>b</th></tr></thead>' +
        "<tbody><tr><td>1</td><td>2</td></tr></tbody></table></div>"
    );
  });

  it("only makes a table when the divider row follows", () => {
    expect(html("not a table | just a sentence")).toBe("<p>not a table | just a sentence</p>");
    expect(html("|---|---|")).toBe("<p>|---|---|</p>");
  });

  it("honours alignment colons", () => {
    const out = html("| l | c | r |\n|:--|:-:|--:|\n| 1 | 2 | 3 |");
    expect(out).toContain('<th style="text-align:left">l</th>');
    expect(out).toContain('<th style="text-align:center">c</th>');
    expect(out).toContain('<th style="text-align:right">r</th>');
  });

  it("pads short rows and trims long ones, as GFM does", () => {
    const out = html("| a | b |\n|---|---|\n| 1 |\n| 1 | 2 | 3 |");
    expect(out).toContain("<tr><td>1</td><td></td></tr>");
    expect(out).toContain("<tr><td>1</td><td>2</td></tr>");
    expect(out).not.toContain("<td>3</td>");
  });

  it("works without outer pipes and keeps an escaped pipe literal", () => {
    expect(html("a | b\n--- | ---\n1 | 2")).toContain("<th>a</th><th>b</th>");
    expect(html("| x |\n|---|\n| a \\| b |")).toContain("<td>a | b</td>");
  });

  it("survives ending the note with no trailing newline", () => {
    expect(html("| x |\n|---|\n| y |")).toContain("<td>y</td>");
  });
});

describe("inline", () => {
  it("handles bold, italic, strike and code", () => {
    expect(html("**b** *i* ~~s~~ `c`")).toBe("<p><b>b</b> <i>i</i> <s>s</s> <code>c</code></p>");
  });

  it("renders links and images, image first so the bang is not eaten", () => {
    expect(html("[t](https://e.com)")).toBe(
      '<p><a href="https://e.com" target="_blank" rel="noreferrer">t</a></p>'
    );
    expect(html("![a](https://e.com/i.png)")).toBe(
      '<p><img src="https://e.com/i.png" alt="a" loading="lazy"></p>'
    );
  });

  it("autolinks bare URLs but leaves code spans and existing links alone", () => {
    expect(html("see https://e.com/x")).toContain('<a href="https://e.com/x"');
    expect(html("`https://e.com`")).toBe("<p><code>https://e.com</code></p>");
    expect(html("[t](https://e.com)").match(/<a /g)).toHaveLength(1);
  });

  it("refuses schemes other than http(s)", () => {
    expect(html("[t](javascript:alert(1))")).not.toContain("<a ");
    expect(html("![i](data:text/html;base64,AAAA)")).not.toContain("<img");
  });
});

describe("task lists", () => {
  it("renders a checkbox per item, numbered in document order", () => {
    const out = html("- [ ] one\n- [x] two");
    expect(out).toContain('<input type="checkbox" data-task="0">');
    expect(out).toContain('<input type="checkbox" data-task="1" checked>');
    expect(out).toContain('<span class="md-task-done">two</span>');
  });

  it("keeps numbering continuous across nesting", () => {
    const out = html("- [ ] parent\n  - [x] child\n- [ ] sibling");
    expect(out.match(/data-task="\d"/g)).toEqual([
      'data-task="0"',
      'data-task="1"',
      'data-task="2"',
    ]);
  });

  it("flips the line the click came from and nothing else", () => {
    expect(toggleTaskInMd("- [ ] a\n- [ ] b", 1)).toBe("- [ ] a\n- [x] b");
    expect(toggleTaskInMd("- [x] a", 0)).toBe("- [ ] a");
    expect(toggleTaskInMd("- [ ] a\n  - [x] b", 1)).toBe("- [ ] a\n  - [ ] b");
  });

  it("leaves the note untouched when the task is gone", () => {
    expect(toggleTaskInMd("- [ ] a", 9)).toBe("- [ ] a");
    expect(toggleTaskInMd("no tasks here", 0)).toBe("no tasks here");
  });
});

/**
 * Regression tests for a real hole: an unescaped double quote in a URL or an
 * alt closed the attribute early, and the rest of the line became a live event
 * handler. Anything that puts an on* attribute inside a tag must stay broken.
 */
describe("no HTML injection", () => {
  /**
   * An attribute value is delimited by a double quote, so a breakout needs a
   * RAW quote immediately followed by the handler. Looking merely for "onerror="
   * inside a tag is not the test: an escaped &quot;onerror=&quot; sits harmlessly
   * inside the value, and asserting on that would fail a renderer that is fine.
   */
  const liveHandler = (out: string) => /"\s*\bon\w+\s*=/i.test(out);

  it("escapes raw HTML", () => {
    expect(html("<script>alert(1)</script>")).toBe("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
    expect(html("<img src=x onerror=alert(1)>")).not.toContain("<img");
  });

  const breakouts = [
    ['![x"onerror="alert(1)](https://a.com/404.png)', "image alt"],
    ['[x](https://a.com"onmouseover="alert(1))', "link href"],
    ['https://a.com/"onmouseover="alert(1)', "autolinked URL"],
    ['![x](https://a.com/"onerror="alert(1))', "image src"],
    ["| a |\n|---|\n| x\"onerror=\"alert(1) |", "table cell"],
    ['# x"onerror="alert(1)', "heading"],
  ] as const;

  for (const [payload, where] of breakouts) {
    it(`cannot break out of an attribute through the ${where}`, () => {
      const out = html(payload);
      expect(liveHandler(out)).toBe(false);
      // and prove the quote was neutralised rather than merely absent
      expect(out).not.toMatch(/<[^>]*\son\w+\s*=\s*"/i);
      expect(out.includes("&quot;") || !out.includes("onerror") && !out.includes("onmouseover")).toBe(true);
    });
  }

  it("the detector itself catches a genuine breakout", () => {
    // guards the guard: if this ever stops failing, the tests above prove nothing
    expect(liveHandler('<img src="x"onerror="alert(1)">')).toBe(true);
    expect(liveHandler('<img src="x&quot;onerror=&quot;alert(1)">')).toBe(false);
  });

  it("still renders ordinary quotes and apostrophes as themselves", () => {
    expect(html('a "quoted" phrase, don\'t break it')).toBe(
      "<p>a &quot;quoted&quot; phrase, don&#39;t break it</p>"
    );
  });
});

describe("noteSnippet", () => {
  it("strips markdown plumbing rather than leaking it into a card", () => {
    expect(noteSnippet("## Title\n\n- one\n- two")).toBe("Title one two");
    expect(noteSnippet("- [x] done thing")).toBe("done thing");
    expect(noteSnippet("| a | b |\n|---|---|\n| 1 | 2 |")).toBe("a b 1 2");
    expect(noteSnippet("```\ncode\n```")).toBe("code");
    expect(noteSnippet("![alt text](https://e.com/i.png)")).toBe("alt text");
  });

  it("handles a legacy HTML body and its entities", () => {
    expect(noteSnippet("<p>hello&nbsp;&amp;&nbsp;goodbye</p>")).toBe("hello & goodbye");
  });

  it("is empty for an empty note", () => {
    expect(noteSnippet(null)).toBe("");
    expect(noteSnippet("")).toBe("");
  });
});
