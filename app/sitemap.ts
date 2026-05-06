import type { MetadataRoute } from "next";
import { getAllMatches } from "@/lib/football";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.SITE_URL ?? "https://example.com";
  const now = new Date();

  const matches = await getAllMatches().catch(() => []);

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
    // News pages don't have detail routes yet (no /news/[slug] route).
    // Skip news entries until the route exists.
  ];
}
