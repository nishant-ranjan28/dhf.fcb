import { formatBlogPost, isTelegramConfigured, sendTelegramMessage } from "@/lib/telegram";
import { isFacebookConfigured, postToFacebookPage } from "@/lib/facebook";
import { isIndexNowConfigured, submitToIndexNow } from "@/lib/indexnow";
import { isXConfigured, postToX, formatTweet } from "@/lib/x";
import { isBlueskyConfigured, postToBluesky } from "@/lib/bluesky";
import type { BlogPost } from "@/lib/blog/types";
import type { AnnounceResults } from "./types";

type Status = "ok" | "err" | "skipped";

function report(channel: string) {
  return (r: { ok: boolean; error?: string }): Status => {
    if (!r.ok) console.warn(`[autopost] ${channel} error:`, r.error);
    return r.ok ? "ok" : "err";
  };
}

export async function announce(post: BlogPost, siteUrl: string): Promise<AnnounceResults> {
  const url = `${siteUrl}/blog/${post.slug}`;
  const skipped = Promise.resolve("skipped" as const);
  const [tg, fb, inow, x, bsky] = await Promise.all([
    isTelegramConfigured()
      ? sendTelegramMessage({ text: formatBlogPost(post, siteUrl) }).then(report("telegram"))
      : skipped,
    isFacebookConfigured()
      ? postToFacebookPage({ message: `${post.title}\n\n${post.excerpt}`, link: url }).then(
          report("facebook"),
        )
      : skipped,
    isIndexNowConfigured()
      ? submitToIndexNow([url], siteUrl).then(report("indexnow"))
      : skipped,
    isXConfigured() ? postToX({ text: formatTweet(post.title, url) }).then(report("x")) : skipped,
    isBlueskyConfigured()
      ? postToBluesky({ title: post.title, url }).then(report("bluesky"))
      : skipped,
  ]);
  return { telegram: tg, facebook: fb, indexnow: inow, x, bluesky: bsky };
}
