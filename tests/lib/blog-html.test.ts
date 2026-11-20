import { describe, it, expect } from "vitest";
import { estimateReadingMinutes, splitHtmlIntoSections } from "@/lib/blog/html";

describe("splitHtmlIntoSections", () => {
  it("splits rendered markdown at H2 boundaries", () => {
    const html = "<p>Intro</p><h2>What happened</h2><p>A</p><h2>Why it matters</h2><p>B</p>";
    const blocks = splitHtmlIntoSections(html);
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toContain("Intro");
    expect(blocks[1]).toContain("What happened");
    expect(blocks[2]).toContain("Why it matters");
  });

  it("keeps a one-section post intact", () => {
    const html = "<p>No headings here, just copy.</p>";
    expect(splitHtmlIntoSections(html)).toEqual([html]);
  });

  it("returns nothing for an empty body", () => {
    expect(splitHtmlIntoSections("  ")).toEqual([]);
  });
});

describe("estimateReadingMinutes", () => {
  it("rounds up from roughly 180 words per minute", () => {
    expect(estimateReadingMinutes("word ".repeat(180))).toBe(1);
    expect(estimateReadingMinutes("word ".repeat(181))).toBe(2);
  });

  it("ignores html and markdown noise", () => {
    expect(estimateReadingMinutes("# Title\n\n**word** <div>word</div>")).toBe(1);
  });
});
