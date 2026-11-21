import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { cache, Fragment } from "react";
import { TelegramCTA } from "@/components/TelegramCTA";
import { AdSlot } from "@/components/AdSlot";
import { NativeBanner } from "@/components/NativeBanner";
import { ShareButtons } from "@/components/ShareButtons";
import { SocialPostStrip } from "@/components/SocialPostStrip";
import { ViewBeacon } from "@/components/ViewBeacon";
import { PostNavigation } from "@/components/PostNavigation";
import { RelatedPosts } from "@/components/RelatedPosts";
import { DisqusComments } from "@/components/DisqusComments";
import { blogStore } from "@/lib/blog/store";
import { renderMarkdown } from "@/lib/blog/markdown";
import { estimateReadingMinutes, splitHtmlIntoSections } from "@/lib/blog/html";
import { viewStore, formatViews } from "@/lib/blog/views";
import { adjacentPosts, relatedPosts } from "@/lib/blog/related";
import { env } from "@/lib/env";

// force-dynamic: the post page reads from Upstash on every request. We
// previously used ISR (revalidate=60) but a 404 cached at the moment
// Upstash was unreachable would persist for the full window. The full post
// body is fetched once per request (shared with generateMetadata), while the
// related/navigation list reads metadata only.
export const dynamic = "force-dynamic";

// `generateMetadata` and the page render both need the full post. React's
// request-scoped cache avoids fetching the same body twice.
const getPost = cache(async (slug: string) => blogStore().get(slug));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return { title: "Post not found" };
  // AdSense-safety: posts younger than 10 minutes return noindex,follow so
  // search engines don't pick up a half-baked autopost while we're still in
  // the editorial window. Posts >= 10 min old fall through to the default
  // (indexable) behaviour — no robots field emitted.
  const ageMs = Date.now() - new Date(post.createdAt).getTime();
  const isFresh = ageMs < 10 * 60 * 1000;
  return {
    title: post.title,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: "article",
      publishedTime: post.createdAt,
      modifiedTime: post.updatedAt,
      authors: [post.author],
      tags: post.tags,
      ...(post.coverImage && { images: [{ url: post.coverImage }] }),
    },
    ...(isFresh && { robots: { index: false, follow: true } }),
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [post, allPosts] = await Promise.all([
    getPost(slug),
    blogStore().list({ limit: 100 }),
  ]);
  if (!post) notFound();

  const blocks = splitHtmlIntoSections(renderMarkdown(post.body));
  const readingMinutes = estimateReadingMinutes(post.body);
  const socialPosts = post.socialPosts ?? [];
  const views = await viewStore().get(slug);
  const shareUrl = `${env.siteUrl}/blog/${post.slug}`;
  const { newer, older } = adjacentPosts(allPosts, slug);
  const related = relatedPosts(allPosts, slug, 3);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt,
    datePublished: post.createdAt,
    dateModified: post.updatedAt,
    author: { "@type": "Person", name: post.author },
    publisher: { "@type": "Organization", name: "BarcaPulse" },
    url: `${env.siteUrl}/blog/${post.slug}`,
    keywords: post.tags.join(", "),
    ...(post.coverImage && { image: post.coverImage }),
  };

  const date = new Date(post.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <article className="px-3 mt-3 md:px-0">
        <div className="mb-3">
          <Link href="/blog" className="text-xs text-ink-muted hover:text-white">
            ← Blog
          </Link>
        </div>

        {/* Image-first, low-noise header: one visual, one headline, one
            one-line brief. Everything else is secondary. */}
        <div className="overflow-hidden rounded-2xl border border-ink-line bg-ink-soft">
          {post.coverImage ? (
            <div className="relative aspect-video bg-ink-line md:aspect-[21/9]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={post.coverImage}
                alt=""
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
              <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-barca-gold ring-1 ring-barca-gold/40 backdrop-blur-sm">
                In 60 seconds
              </span>
            </div>
          ) : (
            <div className="relative h-28 overflow-hidden bg-gradient-to-br from-[#A50044] via-[#3B1E57] to-[#0B0B0F] md:h-40">
              <span
                aria-hidden
                className="absolute -right-4 -bottom-10 text-[110px] leading-none opacity-20"
              >
                ⚽
              </span>
              <span className="absolute left-4 top-4 rounded-full bg-black/35 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-barca-gold ring-1 ring-barca-gold/40">
                BarcaPulse Brief
              </span>
            </div>
          )}
          <div className="p-4 md:p-6">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-muted">
              <span className="font-semibold text-barca-gold">BLOG</span>
              <span>·</span>
              <span>{readingMinutes} min read</span>
              <span>·</span>
              <span>{post.author}</span>
              <span>·</span>
              <time dateTime={post.createdAt}>{date}</time>
              <span>·</span>
              <span title={`${views.toLocaleString()} views`}>
                {formatViews(views)} {views === 1 ? "view" : "views"}
              </span>
            </div>
            <h1 className="mt-2 text-[26px] font-extrabold leading-[1.15] text-white md:text-4xl">
              {post.title}
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-gray-200 md:text-base">
              {post.excerpt}
            </p>
            {post.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {post.tags.slice(0, 4).map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-ink px-2 py-0.5 text-[10px] text-ink-muted ring-1 ring-ink-line"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            )}
            <ShareButtons url={shareUrl} title={post.title} excerpt={post.excerpt} tags={post.tags} />
          </div>
        </div>

        <AdSlot size="300x250" label="Sponsored" />

        {/* Ads and social posts land at section boundaries, never in the
            middle of a paragraph. Short posts still get one break. */}
        <div className="mt-3">
          {blocks.map((block, i) => (
            <Fragment key={i}>
              <div
                className="article-section prose-blog text-[15px] leading-relaxed md:text-[17px]"
                dangerouslySetInnerHTML={{ __html: block }}
              />
              {i === 0 && <SocialPostStrip posts={socialPosts} />}
              {(i === 0 || i === 1) && <AdSlot size="300x250" label="Sponsored" />}
              {i === 2 && <NativeBanner />}
            </Fragment>
          ))}
          {/* Legacy single-block posts still get the native unit. */}
          {blocks.length < 3 && <NativeBanner />}
        </div>

        <PostNavigation newer={newer} older={older} />

        <RelatedPosts posts={related} />

        <DisqusComments
          identifier={post.slug}
          url={shareUrl}
          title={post.title}
        />
      </article>

      <ViewBeacon slug={post.slug} />
      <TelegramCTA />
      <AdSlot size="300x250" />
    </>
  );
}
