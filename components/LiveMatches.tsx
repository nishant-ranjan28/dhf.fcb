import { MatchCard } from "./MatchCard";
import type { Match } from "@/lib/types";

export function LiveMatches({ matches }: { matches: Match[] }) {
  if (matches.length === 0) {
    return (
      <div className="mx-4 bg-ink-soft border border-ink-line rounded-xl p-4 text-center text-ink-muted text-sm">
        No live matches right now. Check back at kickoff.
      </div>
    );
  }
  return (
    <div className="px-4 space-y-2">
      {matches.map((m) => (
        <MatchCard key={m.slug} match={m} />
      ))}
    </div>
  );
}
