import Link from "next/link";
import { blogStore } from "@/lib/blog/store";
import { DeletePostButton } from "./DeletePostButton";

export const dynamic = "force-dynamic";

export default async function AdminBlogList() {
  const posts = await blogStore().list({ limit: 100 });

  return (
    <div className="px-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-lg font-bold text-white">Blog posts</h1>
        <Link
          href="/admin/blog/new"
          className="text-xs font-semibold rounded-md bg-barca-blue text-white px-3 py-1.5"
        >
          + New post
        </Link>
      </div>

      {posts.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No posts yet. <Link href="/admin/blog/new" className="text-barca-gold">Write the first one.</Link>
        </p>
      ) : (
        <ul className="divide-y divide-ink-line bg-ink-soft border border-ink-line rounded-xl">
          {posts.map((p) => (
            <li key={p.slug} className="px-3 py-2.5 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <Link href={`/blog/${p.slug}`} className="block text-sm text-white truncate font-medium">
                  {p.title}
                </Link>
                <div className="text-[11px] text-ink-muted truncate">
                  {new Date(p.createdAt).toLocaleString()} · {p.tags.join(", ") || "no tags"}
                </div>
              </div>
              <DeletePostButton slug={p.slug} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
