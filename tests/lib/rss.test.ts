import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { parseRss } from "@/lib/news/rss";

describe("parseRss", () => {
  it("parses RSS 2.0 with multiple items", async () => {
    const xml = await readFile("tests/fixtures/bbc-football.xml", "utf8");
    const items = parseRss(xml, "bbc", "fifa");
    expect(items.length).toBe(2);
    expect(items[0].title).toBe("Yamal stars in Barcelona win");
    expect(items[0].slug).toMatch(/^[a-z0-9-]+$/);
    expect(items[0].category).toBe("fifa");
    expect(items[0].content).toContain("Lamine Yamal");
    expect(items[0].content).not.toContain("<p>");
    expect(items[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("handles a single-item feed (XML parser quirk)", () => {
    const xml = `<?xml version="1.0"?><rss><channel><item><title>Single</title><description>One</description><pubDate>Wed, 06 May 2026 12:00:00 GMT</pubDate></item></channel></rss>`;
    const items = parseRss(xml, "test", "barca");
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Single");
  });

  it("returns empty for malformed input", () => {
    expect(parseRss("not xml at all", "test", "barca")).toEqual([]);
    expect(parseRss("", "test", "barca")).toEqual([]);
  });
});
