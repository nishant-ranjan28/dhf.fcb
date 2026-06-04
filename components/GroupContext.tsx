import type { Match } from "@/lib/types";
import { computeStandings } from "@/lib/standings";
import { StandingsTable } from "./StandingsTable";
import { MatchCard } from "./MatchCard";

/**
 * Group-stage context for a single match: the live group table plus the other
 * fixtures in that group. Renders nothing for non-group (knockout) matches.
 */
export function GroupContext({
  match,
  groupMatches,
}: {
  match: Match;
  groupMatches: Match[];
}) {
  if (!match.group) return null;

  const standings = computeStandings(groupMatches);
  const others = groupMatches
    .filter((m) => m.slug !== match.slug)
    .sort((a, b) => +new Date(a.kickoff) - +new Date(b.kickoff));

  if (standings.length === 0) return null;

  return (
    <section className="mt-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-2 px-4">
        {match.group} table
      </h2>
      <StandingsTable groups={standings} />

      {others.length > 0 && (
        <>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-2 mt-4 px-4">
            Other {match.group} fixtures
          </h2>
          <div className="px-4 space-y-2">
            {others.map((m) => (
              <MatchCard key={m.slug} match={m} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
