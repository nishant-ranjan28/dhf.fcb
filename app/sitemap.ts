import type { MetadataRoute } from "next";
import { getAllMatches } from "@/lib/football";
import { blogStore } from "@/lib/blog/store";
import { env } from "@/lib/env";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.siteUrl;
  const now = new Date();

  const [matches, blogPosts] = await Promise.all([
    getAllMatches().catch(() => []),
    blogStore().list({ limit: 1000 }).catch(() => []),
  ]);

  return [
    {
      url: `${base}/`,
      lastModified: now,
      changeFrequency: "hourly" as const,
      priority: 1.0,
    },
    {
      url: `${base}/barca`,
      lastModified: now,
      changeFrequency: "hourly" as const,
      priority: 0.9,
    },
    {
      url: `${base}/fifa`,
      lastModified: now,
      changeFrequency: "hourly" as const,
      priority: 0.9,
    },
    {
      url: `${base}/live`,
      lastModified: now,
      changeFrequency: "always" as const,
      priority: 0.8,
    },
    ...matches.map((m) => ({
      url: `${base}/match/${m.slug}`,
      lastModified: new Date(m.kickoff),
      changeFrequency: "hourly" as const,
      priority: 0.7,
    })),
    {
      url: `${base}/blog`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.85,
    },
    {
      url: `${base}/about`,
      lastModified: new Date("2026-05-07"),
      changeFrequency: "monthly" as const,
      priority: 0.4,
    },
    {
      url: `${base}/privacy`,
      lastModified: new Date("2026-05-07"),
      changeFrequency: "yearly" as const,
      priority: 0.3,
    },
    {
      url: `${base}/terms`,
      lastModified: new Date("2026-05-07"),
      changeFrequency: "yearly" as const,
      priority: 0.3,
    },
    ...blogPosts.map((p) => ({
      url: `${base}/blog/${p.slug}`,
      lastModified: new Date(p.updatedAt),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    // News pages don't have detail routes yet (no /news/[slug] route).
    // Skip news entries until the route exists.
  ];
}
