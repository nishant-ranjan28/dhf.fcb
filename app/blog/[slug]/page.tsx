import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { TelegramCTA } from "@/components/TelegramCTA";
import { AdSlot } from "@/components/AdSlot";
import { blogStore } from "@/lib/blog/store";
import { renderMarkdown } from "@/lib/blog/markdown";
import { env } from "@/lib/env";

// force-dynamic: the post page reads from Upstash on every request. We
// previously used ISR (revalidate=60) but a 404 cached at the moment
// Upstash was unreachable would persist for the full window. Page render
// is server-fast (single Redis GET); skipping ISR is the correct trade.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await blogStore().get(slug);
  if (!post) return { title: "Post not found" };
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
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await blogStore().get(slug);
  if (!post) notFound();

  const html = renderMarkdown(post.body);

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
      <article className="px-4 mt-3">
        <div className="mb-4">
          <Link href="/blog" className="text-xs text-ink-muted">
            ← Blog
          </Link>
        </div>
        {post.coverImage && (
          <div className="aspect-video bg-ink-soft border border-ink-line rounded-xl overflow-hidden mb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={post.coverImage}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
        )}
        <h1 className="text-2xl font-extrabold text-white leading-tight">{post.title}</h1>
        <div className="mt-2 flex items-center gap-2 text-[12px] text-ink-muted">
          <span>{post.author}</span>
          <span>·</span>
          <time dateTime={post.createdAt}>{date}</time>
        </div>
        {post.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {post.tags.map((t) => (
              <span
                key={t}
                className="text-[10px] text-ink-muted bg-ink/60 ring-1 ring-ink-line px-1.5 py-0.5 rounded"
              >
                #{t}
              </span>
            ))}
          </div>
        )}
        <div
          className="prose-blog mt-5 text-[15px] text-white leading-relaxed"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </article>

      <TelegramCTA />
      <AdSlot size="300x250" />
    </>
  );
}
