import type { NewsPost } from "@/lib/types";
import type { SelectedNewsItem } from "./types";

const STOP_WORDS = new Set([
  "the","a","an","and","or","but","for","to","in","on","at","of","by","with",
  "from","as","is","are","was","were","be","been","being","this","that",
  "these","those","it","its","i","you","he","she","we","they",
]);

/** Naive named-entity extraction: capitalized runs of 1–3 words, with stop
 *  words filtered out. Plenty good for sports headlines where club and player
 *  names are usually proper-cased. */
export function extractEntities(title: string): string[] {
  const out = new Set<string>();
  const re = /([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){0,2})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(title)) !== null) {
    const phrase = m[1].toLowerCase();
    if (STOP_WORDS.has(phrase)) continue;
    if (phrase.length < 3) continue;
    out.add(phrase);
  }
  return [...out];
}

export interface SelectOpts {
  /** Entities (lower-case) seen in posts published over the lookback window. */
  recentEntities: string[];
  /** Source-slug prefixes to skip. A prefix matches when the news slug starts
   *  with `${prefix}-` (e.g. ["bbc-sport-barcelona"] hides any item whose slug
   *  begins with "bbc-sport-barcelona-"). */
  excludeSources: string[];
}

export function selectNewsItem(
  items: NewsPost[],
  opts: SelectOpts,
): SelectedNewsItem | null {
  const recentSet = new Set(opts.recentEntities.map((e) => e.toLowerCase()));
  const excludePrefixes = opts.excludeSources.map((p) => `${p}-`);

  const candidates = items
    .filter((it) => (it.lang ?? "en") === "en")
    .filter((it) => it.title.trim().length > 0)
    .filter((it) => !excludePrefixes.some((p) => it.slug.startsWith(p)))
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  for (const it of candidates) {
    const entities = extractEntities(it.title);
    if (entities.length === 0) continue;
    if (entities.some((e) => recentSet.has(e))) continue;
    return { source: it, entities };
  }
  return null;
}
