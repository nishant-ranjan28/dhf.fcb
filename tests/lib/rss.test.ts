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
    // Slug should be source-prefixed so duplicate headlines across feeds
    // don't collide.
    expect(items[0].slug.startsWith("bbc-")).toBe(true);
    expect(items[0].category).toBe("fifa");
    expect(items[0].content).toContain("Lamine Yamal");
    expect(items[0].content).not.toContain("<p>");
    expect(items[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("survives numeric/named HTML entities in title and content", () => {
    // fast-xml-parser decodes most entities itself; the stripHtml regex is
    // defensive insurance for entities that slip through (rare encodings).
    // Title decodes &#8217; to a curly apostrophe; content decodes &apos; to '.
    const xml = `<?xml version="1.0"?><rss><channel><item><title>Hi &#8217;there&#8217;</title><description>It&apos;s ok</description></item></channel></rss>`;
    const items = parseRss(xml, "test", "barca");
    expect(items[0].title).toContain("there");
    expect(items[0].content).toContain("It");
    expect(items[0].content).toContain("ok");
  });

  it("source-prefixes slugs so identical headlines from different feeds don't collide", () => {
    const xml = `<?xml version="1.0"?><rss><channel><item><title>Same Headline</title></item></channel></rss>`;
    const a = parseRss(xml, "BBC Sport", "fifa");
    const b = parseRss(xml, "ESPN FC", "fifa");
    expect(a[0].slug).not.toBe(b[0].slug);
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
