"use client";

import { useState } from "react";
import { MatchCard } from "./MatchCard";
import type { Match } from "@/lib/types";

/**
 * A list of matches capped to `initial` items with a "Show all N" / "Show less"
 * toggle, so long fixture lists (e.g. 100+ World Cup matches) don't bury the
 * rest of the page. The toggle only appears when there's more to show.
 */
export function MatchList({ matches, initial = 6 }: { matches: Match[]; initial?: number }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? matches : matches.slice(0, initial);

  return (
    <>
      <div className="px-4 space-y-2">
        {shown.map((m) => (
          <MatchCard key={m.slug} match={m} />
        ))}
      </div>

      {matches.length > initial && (
        <div className="px-4 mt-3">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="w-full rounded-xl border border-ink-line bg-ink-soft py-2.5 text-sm font-semibold text-ink-muted hover:text-white transition"
          >
            {showAll ? "Show less" : `Show all ${matches.length}`}
          </button>
        </div>
      )}
    </>
  );
}
