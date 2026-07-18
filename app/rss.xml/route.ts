// Serves /rss.xml — RSS 2.0 feed of the latest blog posts. Revalidates
// hourly, same cadence as the sitemap; autopost cadence is slower than that,
// so readers never lag more than one cron cycle behind.

import { blogStore } from "@/lib/blog/store";
import { buildRssFeed } from "@/lib/blog/feed";
import { env } from "@/lib/env";

export const revalidate = 3600;

export async function GET() {
  const posts = await blogStore()
    .list({ limit: 50 })
    .catch(() => []);
  return new Response(buildRssFeed(posts, env.siteUrl), {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
