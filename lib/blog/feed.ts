// RSS 2.0 feed builder for the blog. Pure — the /rss.xml route handles data
// fetching and caching. Feed readers, Google Discover, and RSS-driven
// syndicators (dlvr.it, IFTTT, Zapier) consume this.

import type { BlogPost } from "./types";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildRssFeed(posts: BlogPost[], siteUrl: string): string {
  const base = siteUrl.replace(/\/$/, "");
  const items = posts
    .map((p) => {
      const url = `${base}/blog/${p.slug}`;
      const categories = p.tags.map((t) => `      <category>${esc(t)}</category>`).join("\n");
      return `    <item>
      <title>${esc(p.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${new Date(p.createdAt).toUTCString()}</pubDate>
      <description>${esc(p.excerpt)}</description>
${categories}
    </item>`;
    })
    .join("\n");

  // lastBuildDate derives from the newest post so the feed output is a pure
  // function of its inputs — cache-friendly and deterministic in tests.
  const newest = posts[0]?.createdAt;
  const lastBuild = newest ? `\n    <lastBuildDate>${new Date(newest).toUTCString()}</lastBuildDate>` : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>BarcaPulse Blog</title>
    <link>${base}/blog</link>
    <description>Mobile-first live scores, lineups, news for FC Barcelona and the FIFA World Cup.</description>
    <language>en</language>${lastBuild}
    <atom:link href="${base}/rss.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`;
}
