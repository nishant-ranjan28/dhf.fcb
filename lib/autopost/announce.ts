import { formatBlogPost, isTelegramConfigured, sendTelegramMessage } from "@/lib/telegram";
import { isFacebookConfigured, postToFacebookPage } from "@/lib/facebook";
import { isIndexNowConfigured, submitToIndexNow } from "@/lib/indexnow";
import type { BlogPost } from "@/lib/blog/types";
import type { AnnounceResults } from "./types";

export async function announce(post: BlogPost, siteUrl: string): Promise<AnnounceResults> {
  const url = `${siteUrl}/blog/${post.slug}`;
  const [tg, fb, inow] = await Promise.all([
    isTelegramConfigured()
      ? sendTelegramMessage({ text: formatBlogPost(post, siteUrl) }).then((r) => {
          if (!r.ok) console.warn("[autopost] telegram error:", r.error);
          return r.ok ? ("ok" as const) : ("err" as const);
        })
      : Promise.resolve("skipped" as const),
    isFacebookConfigured()
      ? postToFacebookPage({ message: `${post.title}\n\n${post.excerpt}`, link: url }).then((r) => {
          if (!r.ok) console.warn("[autopost] facebook error:", r.error);
          return r.ok ? ("ok" as const) : ("err" as const);
        })
      : Promise.resolve("skipped" as const),
    isIndexNowConfigured()
      ? submitToIndexNow([url], siteUrl).then((r) => {
          if (!r.ok) console.warn("[autopost] indexnow error:", r.error);
          return r.ok ? ("ok" as const) : ("err" as const);
        })
      : Promise.resolve("skipped" as const),
  ]);
  return { telegram: tg, facebook: fb, indexnow: inow };
}
