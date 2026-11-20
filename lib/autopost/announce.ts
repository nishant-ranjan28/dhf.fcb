import { formatBlogPost, isTelegramConfigured, sendTelegramMessage } from "@/lib/telegram";
import { isFacebookConfigured, postToFacebookPage } from "@/lib/facebook";
import { isIndexNowConfigured, submitToIndexNow } from "@/lib/indexnow";
import { isXConfigured, postToX, formatTweet } from "@/lib/x";
import { isBlueskyConfigured, postToBluesky } from "@/lib/bluesky";
import { isMastodonConfigured, postToMastodon } from "@/lib/mastodon";
import { isThreadsConfigured, postToThreads } from "@/lib/threads";
import { isRedditConfigured, postToReddit } from "@/lib/reddit";
import type { BlogPost } from "@/lib/blog/types";
import type { AnnounceChannel, AnnounceResults } from "./types";

type Status = "ok" | "err" | "skipped";
type PublishResult = { ok: boolean; error?: string; url?: string };

function report(
  channel: AnnounceChannel,
  errors: Partial<Record<AnnounceChannel, string>>,
  postUrls: Partial<Record<AnnounceChannel, string>>,
) {
  return (r: PublishResult): Status => {
    if (!r.ok) {
      errors[channel] = r.error ?? "unknown error";
      console.warn(`[autopost] ${channel} error:`, r.error);
    } else if (r.url) {
      postUrls[channel] = r.url;
    }
    return r.ok ? "ok" : "err";
  };
}

export async function announce(post: BlogPost, siteUrl: string): Promise<AnnounceResults> {
  const url = `${siteUrl}/blog/${post.slug}`;
  const skipped = Promise.resolve("skipped" as const);
  const errors: Partial<Record<AnnounceChannel, string>> = {};
  const postUrls: Partial<Record<AnnounceChannel, string>> = {};
  const [tg, fb, inow, x, bsky, masto, threads, reddit] = await Promise.all([
    isTelegramConfigured()
      ? sendTelegramMessage({ text: formatBlogPost(post, siteUrl) }).then(
          report("telegram", errors, postUrls),
        )
      : skipped,
    isFacebookConfigured()
      ? postToFacebookPage({ message: `${post.title}\n\n${post.excerpt}`, link: url }).then(
          report("facebook", errors, postUrls),
        )
      : skipped,
    isIndexNowConfigured()
      ? submitToIndexNow([url], siteUrl).then(report("indexnow", errors, postUrls))
      : skipped,
    isXConfigured()
      ? postToX({ text: formatTweet(post.title, url) }).then(report("x", errors, postUrls))
      : skipped,
    isBlueskyConfigured()
      ? postToBluesky({
          title: post.title,
          url,
          description: post.excerpt,
          imageUrl: post.coverImage,
        }).then(report("bluesky", errors, postUrls))
      : skipped,
    isMastodonConfigured()
      ? postToMastodon({ title: post.title, url }).then(report("mastodon", errors, postUrls))
      : skipped,
    isThreadsConfigured()
      ? postToThreads({ title: post.title, url }).then(report("threads", errors, postUrls))
      : skipped,
    isRedditConfigured()
      ? postToReddit({ title: post.title, url }).then(report("reddit", errors, postUrls))
      : skipped,
  ]);
  return {
    telegram: tg,
    facebook: fb,
    indexnow: inow,
    x,
    bluesky: bsky,
    mastodon: masto,
    threads,
    reddit,
    ...(Object.keys(errors).length > 0 ? { errors } : {}),
    ...(Object.keys(postUrls).length > 0 ? { postUrls } : {}),
  };
}
