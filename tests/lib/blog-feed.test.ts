import { describe, it, expect } from "vitest";
import { buildRssFeed } from "@/lib/blog/feed";
import type { BlogPost } from "@/lib/blog/types";

function post(overrides: Partial<BlogPost>): BlogPost {
  return {
    slug: "yamal-deal",
    title: "Yamal commits future",
    excerpt: "Contract until 2030.",
    body: "Full body",
    tags: ["barca"],
    createdAt: "2026-05-14T10:00:00.000Z",
    updatedAt: "2026-05-14T10:00:00.000Z",
    author: "BarcaPulse",
    ...overrides,
  };
}

describe("buildRssFeed", () => {
  it("emits valid RSS 2.0 channel with item per post", () => {
    const xml = buildRssFeed([post({}), post({ slug: "second", title: "Second" })], "https://site.com");
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain("<link>https://site.com/blog</link>");
    expect(xml.match(/<item>/g)?.length).toBe(2);
    expect(xml).toContain("<link>https://site.com/blog/yamal-deal</link>");
    expect(xml).toContain('<guid isPermaLink="true">https://site.com/blog/yamal-deal</guid>');
    expect(xml).toContain("<pubDate>Thu, 14 May 2026 10:00:00 GMT</pubDate>");
    expect(xml).toContain("<description>Contract until 2030.</description>");
    expect(xml).toContain("<category>barca</category>");
  });

  it("escapes XML special characters in title and excerpt", () => {
    const xml = buildRssFeed(
      [post({ title: 'Barca "5>3" & <win>', excerpt: "a & b" })],
      "https://site.com",
    );
    expect(xml).toContain("Barca &quot;5&gt;3&quot; &amp; &lt;win&gt;");
    expect(xml).toContain("<description>a &amp; b</description>");
    expect(xml).not.toContain("<win>");
  });

  it("handles empty post list", () => {
    const xml = buildRssFeed([], "https://site.com");
    expect(xml).toContain("<channel>");
    expect(xml).not.toContain("<item>");
  });

  it("strips trailing slash from siteUrl", () => {
    const xml = buildRssFeed([post({})], "https://site.com/");
    expect(xml).toContain("<link>https://site.com/blog/yamal-deal</link>");
  });
});
