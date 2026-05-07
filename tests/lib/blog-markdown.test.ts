import { describe, it, expect } from "vitest";
import { autoEmbedYouTube, renderMarkdown } from "@/lib/blog/markdown";

describe("autoEmbedYouTube", () => {
  it("converts a bare youtu.be URL on its own line into an iframe", () => {
    const out = autoEmbedYouTube("Intro\n\nhttps://youtu.be/dQw4w9WgXcQ\n\nMore text");
    expect(out).toContain("youtube.com/embed/dQw4w9WgXcQ");
    expect(out).toContain("<iframe");
  });

  it("handles youtube.com/watch?v=", () => {
    const out = autoEmbedYouTube("https://www.youtube.com/watch?v=abcdEFGH123");
    expect(out).toContain("youtube.com/embed/abcdEFGH123");
  });

  it("handles youtube.com/shorts/", () => {
    const out = autoEmbedYouTube("https://www.youtube.com/shorts/ZYXwvuTSRq1");
    expect(out).toContain("youtube.com/embed/ZYXwvuTSRq1");
  });

  it("does NOT embed a YouTube URL that is part of a larger sentence", () => {
    const out = autoEmbedYouTube("Watch https://youtu.be/abc12345678 for context");
    expect(out).not.toContain("<iframe");
  });

  it("leaves non-YouTube content alone", () => {
    const md = "Plain **markdown** text\n[link](https://example.com)";
    expect(autoEmbedYouTube(md)).toBe(md);
  });
});

describe("renderMarkdown", () => {
  it("renders standard markdown to HTML", () => {
    const html = renderMarkdown("# Hello\n\nWorld **bold** [link](https://x).");
    expect(html).toContain("<h1");
    expect(html).toContain("Hello");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain('<a href="https://x"');
  });

  it("renders images via markdown image syntax", () => {
    const html = renderMarkdown("![Yamal](https://example.com/yamal.jpg)");
    expect(html).toContain('<img src="https://example.com/yamal.jpg"');
    expect(html).toContain('alt="Yamal"');
  });

  it("auto-embeds YouTube on its own line", () => {
    const html = renderMarkdown("Goal of the season:\n\nhttps://youtu.be/dQw4w9WgXcQ");
    expect(html).toContain("youtube.com/embed/dQw4w9WgXcQ");
    expect(html).toContain("<iframe");
  });

  it("passes raw HTML through (Twitter/Instagram embeds, custom iframes)", () => {
    const md = `Look at this tweet:

<blockquote class="twitter-tweet"><a href="https://twitter.com/x/status/123">tweet</a></blockquote>`;
    const html = renderMarkdown(md);
    expect(html).toContain('class="twitter-tweet"');
  });

  it("handles GFM tables and code fences", () => {
    const md = `| a | b |
| - | - |
| 1 | 2 |

\`\`\`ts
const x = 1;
\`\`\``;
    const html = renderMarkdown(md);
    expect(html).toContain("<table>");
    expect(html).toContain("<td>1</td>");
    expect(html).toContain("<code");
  });
});
