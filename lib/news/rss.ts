import { XMLParser } from "fast-xml-parser";
import type { Competition, NewsPost } from "@/lib/types";
import { toSlug } from "@/lib/slug";

const parser = new XMLParser({ ignoreAttributes: false });

export interface RssSource {
  name: string;
  url: string;
  category: Competition;
}

export const SOURCES: RssSource[] = [
  {
    name: "BBC Sport — Football",
    url: "https://feeds.bbci.co.uk/sport/football/rss.xml",
    category: "fifa",
  },
  {
    name: "ESPN FC",
    url: "https://www.espn.com/espn/rss/soccer/news",
    category: "fifa",
  },
  {
    name: "Marca — Barca",
    url: "https://e00-marca.uecdn.es/rss/futbol/barcelona.xml",
    category: "barca",
  },
  {
    name: "Mundo Deportivo — Barca",
    url: "https://www.mundodeportivo.com/feed/rss/fc-barcelona",
    category: "barca",
  },
];

interface RssItem {
  title?: string;
  link?: string;
  pubDate?: string;
  description?: string;
}
interface RssDoc {
  rss?: { channel?: { item?: RssItem[] | RssItem } };
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseRss(xml: string, source: string, category: Competition): NewsPost[] {
  let doc: RssDoc;
  try {
    doc = parser.parse(xml) as RssDoc;
  } catch {
    return [];
  }
  const raw = doc.rss?.channel?.item;
  if (!raw) return [];
  const items = Array.isArray(raw) ? raw : [raw];
  return items
    .filter((it) => it.title)
    .map((it, i) => {
      const title = stripHtml(String(it.title));
      const slug = toSlug(title) || `${source}-${i}`;
      const desc = stripHtml(String(it.description ?? "")).slice(0, 600);
      const created = it.pubDate ? new Date(it.pubDate) : new Date();
      return {
        id: `${source}-${i}-${slug}`,
        slug,
        title,
        content: desc,
        category,
        createdAt: Number.isNaN(created.getTime()) ? new Date().toISOString() : created.toISOString(),
      };
    });
}

export async function fetchAllNews(): Promise<NewsPost[]> {
  const results = await Promise.allSettled(
    SOURCES.map(async (s) => {
      const res = await fetch(s.url, {
        signal: AbortSignal.timeout(6000),
        headers: { "user-agent": "BarcaPulse/1.0 (+https://example.com)" },
      });
      if (!res.ok) throw new Error(`${s.name}: HTTP ${res.status}`);
      return parseRss(await res.text(), s.name, s.category);
    }),
  );
  return results
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}
