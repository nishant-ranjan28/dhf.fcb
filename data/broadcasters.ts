import type { Competition } from "@/lib/types";

export interface Broadcaster {
  /** ISO 3166-1 alpha-2 region code, or "GLOBAL". Used for viewer matching. */
  code: string;
  /** Human label for the region, e.g. "United States". */
  region: string;
  /** Official broadcaster / streamer name(s). */
  name: string;
  /** Official broadcaster homepage. We only ever link official rights-holders. */
  url: string;
  flag?: string;
}

// Curated, editorial list of OFFICIAL rights-holders. Broadcasters change and
// vary by territory — this is a best-effort starting point, not legal advice.
// The UI always shows a "check local listings" note alongside it.
const FIFA_BROADCASTERS: Broadcaster[] = [
  { code: "GLOBAL", region: "Worldwide", name: "FIFA+", url: "https://www.fifa.com/fifaplus/", flag: "🌍" },
  { code: "US", region: "United States", name: "FOX Sports · Telemundo (ES)", url: "https://www.foxsports.com/soccer", flag: "🇺🇸" },
  { code: "GB", region: "United Kingdom", name: "BBC Sport · ITV", url: "https://www.bbc.co.uk/sport/football", flag: "🇬🇧" },
  { code: "CA", region: "Canada", name: "TSN · CTV", url: "https://www.tsn.ca/soccer", flag: "🇨🇦" },
  { code: "MX", region: "Mexico", name: "Televisa · TUDN", url: "https://www.tudn.com/", flag: "🇲🇽" },
  { code: "AU", region: "Australia", name: "Optus Sport", url: "https://sport.optus.com.au/", flag: "🇦🇺" },
  { code: "IN", region: "India", name: "DAZN / local rights-holder", url: "https://www.fifa.com/fifaplus/", flag: "🇮🇳" },
];

const BARCA_BROADCASTERS: Broadcaster[] = [
  { code: "ES", region: "Spain", name: "Movistar Plus+ · DAZN LaLiga", url: "https://www.dazn.com/", flag: "🇪🇸" },
  { code: "US", region: "United States", name: "ESPN+ · ESPN Deportes", url: "https://plus.espn.com/soccer", flag: "🇺🇸" },
  { code: "GB", region: "United Kingdom", name: "Premier Sports · LaLigaTV", url: "https://www.premiersports.com/", flag: "🇬🇧" },
  { code: "GLOBAL", region: "Worldwide", name: "LaLiga official broadcasters", url: "https://www.laliga.com/en-GB/tv", flag: "🌍" },
];

export function broadcastersFor(competition: Competition): Broadcaster[] {
  return competition === "fifa" ? FIFA_BROADCASTERS : BARCA_BROADCASTERS;
}

/** Pull the ISO region subtag from a BCP-47 locale ("en-US" → "US"). */
export function regionFromLocale(locale: string | undefined): string | null {
  if (!locale) return null;
  const parts = locale.split("-");
  // The region subtag is the last 2-letter (alpha) segment, e.g. "zh-Hant-TW".
  for (let i = parts.length - 1; i >= 1; i--) {
    if (/^[A-Za-z]{2}$/.test(parts[i])) return parts[i].toUpperCase();
  }
  return null;
}

/** Stable sort that floats the viewer's region to the top, preserving the
 *  curated order otherwise. Returns a new array; never drops/dupes entries. */
export function orderByViewerRegion(
  list: Broadcaster[],
  region: string | null,
): Broadcaster[] {
  if (!region) return [...list];
  const match: Broadcaster[] = [];
  const rest: Broadcaster[] = [];
  for (const b of list) (b.code === region ? match : rest).push(b);
  return [...match, ...rest];
}
