import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../src/lib/markdown";
import { readingTime } from "../src/lib/types";

describe("Markdown rendering", () => {
  it("renders authoring features used by the editor", () => {
    const html = renderMarkdown(
      '## 标题\n\n**加粗** 和 *斜体*\n\n> 引用\n\n- 项目\n\n```go\nfmt.Println("hello")\n```\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n![图片](https://example.com/image.png)',
    );
    for (const tag of [
      "<h2>",
      "<strong>",
      "<em>",
      "<blockquote>",
      "<ul>",
      '<code class="language-go">',
      "<table>",
      "<img",
    ])
      expect(html).toContain(tag);
  });
  it("removes scripts, event handlers and unsafe link/image schemes", () => {
    const html = renderMarkdown(
      '<script>alert(1)</script><img src="javascript:alert(1)" onerror="alert(1)"><a href="javascript:alert(1)">bad</a><iframe src="https://evil.example"></iframe>\n\n[bad](javascript:alert%281%29)',
    );
    for (const value of ["<script", "onerror", "javascript:", "<iframe"])
      expect(html).not.toContain(value);
  });
  it("preserves safe links and escapes code instead of executing it", () => {
    const html = renderMarkdown(
      "[site](https://example.com)\n\n```html\n<script>alert(1)</script>\n```",
    );
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("reading estimate", () => {
  it("counts Chinese text and gives a sensible minimum", () => {
    expect(readingTime("")).toBe(1);
    expect(readingTime("字".repeat(700))).toBe(2);
    expect(readingTime("word ".repeat(400))).toBe(2);
  });
});
