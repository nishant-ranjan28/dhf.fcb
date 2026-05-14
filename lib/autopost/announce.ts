import { formatBlogPost, isTelegramConfigured, sendTelegramMessage } from "@/lib/telegram";
import { isFacebookConfigured, postToFacebookPage } from "@/lib/facebook";
import type { BlogPost } from "@/lib/blog/types";
import type { AnnounceResults } from "./types";

export async function announce(post: BlogPost, siteUrl: string): Promise<AnnounceResults> {
  const url = `${siteUrl}/blog/${post.slug}`;
  const [tg, fb] = await Promise.all([
    isTelegramConfigured()
      ? sendTelegramMessage({ text: formatBlogPost(post, siteUrl) }).then((r) => (r.ok ? ("ok" as const) : ("err" as const)))
      : Promise.resolve("skipped" as const),
    isFacebookConfigured()
      ? postToFacebookPage({ message: `${post.title}\n\n${post.excerpt}`, link: url }).then((r) =>
          r.ok ? ("ok" as const) : ("err" as const),
        )
      : Promise.resolve("skipped" as const),
  ]);
  return { telegram: tg, facebook: fb };
}
