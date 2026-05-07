import Link from "next/link";
import { SectionTitle } from "@/components/SectionTitle";
import { BlogCard } from "@/components/BlogCard";
import { TelegramCTA } from "@/components/TelegramCTA";
import { AdSlot } from "@/components/AdSlot";
import { blogStore } from "@/lib/blog/store";

// Read-on-request like /blog/[slug] — keeps the list current after admin
// publishes/deletes without waiting for the ISR window or revalidatePath
// to round-trip. Single Redis ZRANGE+MGET, sub-50ms typically.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "BarcaPulse Blog — Long-form Barca writing",
  description:
    "Original tactical analysis, opinion, and longform on FC Barcelona and the FIFA World Cup.",
};

export default async function BlogPage() {
  const posts = await blogStore().list({ limit: 30 });

  return (
    <>
      <SectionTitle title="Blog" />
      {posts.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-ink-muted">
          <p>No posts yet.</p>
          <p className="mt-2 text-[12px]">
            Admins:{" "}
            <Link href="/admin/blog/new" className="text-barca-gold">
              write the first post →
            </Link>
          </p>
        </div>
      ) : (
        <div className="px-4 space-y-3">
          {posts.map((p) => (
            <BlogCard key={p.slug} post={p} />
          ))}
        </div>
      )}

      <TelegramCTA />
      <AdSlot size="300x250" />
    </>
  );
}
