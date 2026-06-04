import type { Match } from "@/lib/types";

export interface RecapSelectOpts {
  /** Slugs already recapped — excluded. */
  recapped: Set<string>;
  /** Current time (ms). */
  now: number;
  /** Only consider matches that kicked off within this window. Avoids
   *  back-filling ancient fixtures when the feature is first enabled. */
  maxAgeMs: number;
}

/**
 * Pick the best finished match to recap: a full-time Barça/World Cup fixture
 * that hasn't been recapped yet and finished recently, preferring the most
 * recent. Returns null when nothing is eligible.
 */
export function selectRecapMatch(matches: Match[], opts: RecapSelectOpts): Match | null {
  const eligible = matches.filter(
    (m) =>
      m.status === "FT" &&
      (m.competition === "barca" || m.competition === "fifa") &&
      !opts.recapped.has(m.slug) &&
      opts.now - +new Date(m.kickoff) <= opts.maxAgeMs,
  );
  eligible.sort((a, b) => +new Date(b.kickoff) - +new Date(a.kickoff));
  return eligible[0] ?? null;
}
