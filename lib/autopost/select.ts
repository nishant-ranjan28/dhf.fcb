import type { NewsPost } from "@/lib/types";
import type { SelectedNewsItem } from "./types";

const STOP_WORDS = new Set([
  "the","a","an","and","or","but","for","to","in","on","at","of","by","with",
  "from","as","is","are","was","were","be","been","being","this","that",
  "these","those","it","its","i","you","he","she","we","they",
  // Headline filler that is capitalised only because it starts a sentence.
  // Left in, these become "entities" the generated post must repeat verbatim,
  // which causes the entity-coverage gate to reject otherwise good drafts.
  "why","when","where","what","who","whom","how","can","could","will","would",
  "should","may","might","must","just","only","more","most","less","best",
  "new","now","still","even","ever","never","always","first","last","next",
  "after","before","over","under","about","against","between","through",
  "around","ahead","behind","into","out","up","down","off","on","no","not",
  "yes","one","two","three","four","five","six","seven","eight","nine","ten",
  "all","any","some","every","each","other",
  "another","same","such","than","then","there","here","because","while",
  "during","watch","watched","fan","fans","club","clubs","game","games",
  "deal","deals","offer","offers","star","stars","report","news","update",
  "today","tomorrow","yesterday","monday","tuesday","wednesday","thursday",
  "friday","saturday","sunday","january","february","march","april","may",
  "june","july","august","september","october","november","december",
]);

// Pronouns/verbs that form contractions ("We'll", "It's", "Don't"). These are
// never football entities, but the capitalised-run regex catches them.
const CONTRACTION_BASES = new Set([
  "we","he","she","it","they","you","i","who","what","that","there","here",
  "how","let","do","does","did","don","doesn","didn","can","could","cant",
  "cannot","will","would","wont","should","is","was","are","were","isnt",
  "arent","wasnt","werent","have","has","had","havent","hasnt","hadnt",
  "not","ain","one","some","every","any","best","more","still","why","when",
]);

// Tokens that look like proper nouns but aren't real entities for our
// purposes — news source/site names and generic header words. If any token
// in an extracted phrase matches this set, the whole phrase is dropped.
// Example: "Tranfermarkt LaLiga" capitalised in a headline is a typo'd
// citation, not something the post body should be required to repeat.
const SOURCE_NOISE = new Set([
  // Source / publication names
  "transfermarkt", "tranfermarkt", "marca", "espn", "espnfc", "bbc",
  "reuters", "guardian", "reddit", "mundo", "deportivo", "sky", "afp",
  // Generic header decoration that often appears Capitalised
  "report", "news", "update", "today", "live", "exclusive", "breaking",
  "official", "watch", "video", "photos",
]);

/** Naive named-entity extraction: capitalized runs of 1–3 words, with stop
 *  words and source-noise tokens filtered out. Plenty good for sports
 *  headlines where club and player names are usually proper-cased. */
export function extractEntities(title: string): string[] {
  const out = new Set<string>();
  const re = /([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){0,2})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(title)) !== null) {
    const raw = m[1];
    // "We'll only sell..." / "It's not over" — contraction, not a name.
    const contraction = /^([a-z]+)['’](?:ll|re|ve|d|m|t|s)$/i.exec(raw);
    if (contraction && CONTRACTION_BASES.has(contraction[1].toLowerCase())) continue;
    // "Ajax's future" → entity "ajax", not "ajax's". Same for "Thursday's".
    const phrase = raw.replace(/['’]s$/i, "").toLowerCase();
    if (STOP_WORDS.has(phrase)) continue;
    if (phrase.length < 3) continue;
    if (/^ex-[a-z]$/.test(phrase)) continue; // "Ex-U.S." → "ex-u"
    // Drop phrases whose tokens look like source citations / decoration.
    const tokens = phrase.split(/\s+/);
    if (tokens.some((t) => SOURCE_NOISE.has(t))) continue;
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
