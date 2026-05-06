import { XMLParser } from "fast-xml-parser";
import type { Competition, NewsPost } from "@/lib/types";
import { toSlug } from "@/lib/slug";

const parser = new XMLParser({ ignoreAttributes: false });

export interface RssSource {
  name: string;
  url: string;
  category: Competition;
  /** ISO 639-1 language code. Used to default-filter user-facing feeds. */
  lang: string;
}

// Order doesn't matter for output (results are sorted by date), but it does
// determine which source's slug-prefix wins on duplicate-id collisions.
export const SOURCES: RssSource[] = [
  // ----- English Barca-specific -----
  {
    name: "BBC Sport — Barcelona",
    url: "https://feeds.bbci.co.uk/sport/football/teams/barcelona/rss.xml",
    category: "barca",
    lang: "en",
  },
  {
    name: "The Guardian — Barcelona",
    url: "https://www.theguardian.com/football/barcelona/rss",
    category: "barca",
    lang: "en",
  },
  {
    name: "Sky Sports — Barcelona",
    url: "https://www.skysports.com/rss/12040",
    category: "barca",
    lang: "en",
  },
  {
    name: "r/Barca",
    url: "https://www.reddit.com/r/Barca/.rss",
    category: "barca",
    lang: "en",
  },
  // ----- English FIFA / general football -----
  {
    name: "BBC Sport — Football",
    url: "https://feeds.bbci.co.uk/sport/football/rss.xml",
    category: "fifa",
    lang: "en",
  },
  {
    name: "ESPN FC",
    url: "https://www.espn.com/espn/rss/soccer/news",
    category: "fifa",
    lang: "en",
  },
  // ----- Spanish Barca (kept; UI defaults filter them out, toggle reveals) -----
  {
    name: "Marca — Barca",
    url: "https://e00-marca.uecdn.es/rss/futbol/barcelona.xml",
    category: "barca",
    lang: "es",
  },
  {
    name: "Mundo Deportivo — Barca",
    url: "https://www.mundodeportivo.com/feed/rss/fc-barcelona",
    category: "barca",
    lang: "es",
  },
];

interface RssItem {
  title?: string;
  link?: string;
  pubDate?: string;
  description?: string;
}
interface AtomLink {
  "@_href"?: string;
  "@_rel"?: string;
}
interface AtomEntry {
  title?: string | { "#text"?: string };
  link?: AtomLink | AtomLink[];
  updated?: string;
  published?: string;
  summary?: string | { "#text"?: string };
  content?: string | { "#text"?: string };
}
interface RssDoc {
  rss?: { channel?: { item?: RssItem[] | RssItem } };
  // Reddit serves Atom under `<feed>`; handle both.
  feed?: { entry?: AtomEntry[] | AtomEntry };
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]+);/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickText(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "#text" in v) {
    return String((v as { "#text": unknown })["#text"] ?? "");
  }
  return "";
}

function pickAtomLink(link: AtomLink | AtomLink[] | undefined): string | undefined {
  if (!link) return undefined;
  const links = Array.isArray(link) ? link : [link];
  // Prefer rel="alternate" (the article URL) over self/replies.
  const alt = links.find((l) => l["@_rel"] === "alternate") ?? links[0];
  return alt?.["@_href"];
}

export function parseRss(
  xml: string,
  source: string,
  category: Competition,
  lang: string = "en",
): NewsPost[] {
  let doc: RssDoc;
  try {
    doc = parser.parse(xml) as RssDoc;
  } catch {
    return [];
  }

  const sourceSlug = toSlug(source) || "src";

  // RSS 2.0 path
  const rssRaw = doc.rss?.channel?.item;
  if (rssRaw) {
    const items = Array.isArray(rssRaw) ? rssRaw : [rssRaw];
    return items
      .filter((it) => it.title)
      .map((it, i) => buildPost({
        i,
        sourceSlug,
        category,
        lang,
        title: stripHtml(String(it.title)),
        description: stripHtml(String(it.description ?? "")).slice(0, 600),
        link: it.link,
        pubDate: it.pubDate,
      }));
  }

  // Atom path (Reddit, etc.)
  const atomRaw = doc.feed?.entry;
  if (atomRaw) {
    const entries = Array.isArray(atomRaw) ? atomRaw : [atomRaw];
    return entries
      .filter((e) => pickText(e.title))
      .map((e, i) => buildPost({
        i,
        sourceSlug,
        category,
        lang,
        title: stripHtml(pickText(e.title)),
        description: stripHtml(pickText(e.summary ?? e.content)).slice(0, 600),
        link: pickAtomLink(e.link),
        pubDate: e.published ?? e.updated,
      }));
  }

  return [];
}

interface BuildPostOpts {
  i: number;
  sourceSlug: string;
  category: Competition;
  lang: string;
  title: string;
  description: string;
  link?: string;
  pubDate?: string;
}

function buildPost(o: BuildPostOpts): NewsPost {
  const titleSlug = toSlug(o.title) || `${o.i}`;
  const slug = `${o.sourceSlug}-${titleSlug}`;
  const created = o.pubDate ? new Date(o.pubDate) : new Date();
  return {
    id: `${o.sourceSlug}-${o.i}-${titleSlug}`,
    slug,
    title: o.title,
    content: o.description,
    category: o.category,
    createdAt: Number.isNaN(created.getTime()) ? new Date().toISOString() : created.toISOString(),
    lang: o.lang,
    link: o.link?.trim() || undefined,
  };
}

export async function fetchAllNews(): Promise<NewsPost[]> {
  const results = await Promise.allSettled(
    SOURCES.map(async (s) => {
      const res = await fetch(s.url, {
        signal: AbortSignal.timeout(6000),
        headers: { "user-agent": "BarcaPulse/1.0 (+https://example.com)" },
      });
      if (!res.ok) throw new Error(`${s.name}: HTTP ${res.status}`);
      return parseRss(await res.text(), s.name, s.category, s.lang);
    }),
  );
  return results
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}
