"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MatchCard } from "./MatchCard";
import { toggleFollow, useFollows } from "./follows/store";
import type { Match } from "@/lib/types";

interface Suggestion {
  name: string;
  short: string;
}

export function YourTeams({
  flush = false,
  suggestions = [],
}: {
  /** Drop the horizontal gutter on desktop so the section can sit in a grid. */
  flush?: boolean;
  /** Quick-follow chips shown in the empty state. */
  suggestions?: Suggestion[];
}) {
  const follows = useFollows();
  const [matches, setMatches] = useState<Match[] | null>(null);

  useEffect(() => {
    if (follows.length === 0) {
      setMatches([]);
      return;
    }
    const ctrl = new AbortController();
    fetch(`/api/follows?teams=${encodeURIComponent(follows.join(","))}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((j: { matches: Match[] }) => setMatches(j.matches))
      .catch(() => {});
    return () => ctrl.abort();
  }, [follows]);

  const gutter = flush ? "px-4 lg:px-0" : "px-4";
  const edge = flush ? "mx-4 lg:mx-0" : "mx-4";

  const heading = (
    <div className={`flex items-baseline justify-between mt-6 mb-2 ${gutter} ${flush ? "lg:mt-0" : ""}`}>
      <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-white uppercase">
        <span className="h-3.5 w-1 rounded-full bg-barca-gold" aria-hidden />
        Your Teams
      </h2>
      <Link href="/teams" className="text-xs text-ink-muted hover:text-white">
        {follows.length > 0 ? "Manage" : "Follow teams"} →
      </Link>
    </div>
  );

  if (follows.length === 0) {
    return (
      <>
        {heading}
        <div className={`${edge} rounded-xl border border-dashed border-ink-line bg-ink-soft p-4`}>
          <div className="flex items-start gap-3">
            <span className="text-xl leading-none" aria-hidden>
              ⭐
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">No teams followed yet</p>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
                Follow clubs and national teams to see their live scores, fixtures and results here.
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {suggestions.map((t) => (
              <button
                key={t.name}
                type="button"
                onClick={() => toggleFollow(t.name)}
                className="rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-ink-muted ring-1 ring-ink-line transition hover:text-white hover:ring-white/40 active:scale-95"
              >
                + {t.name}
              </button>
            ))}
            <Link
              href="/teams"
              className="rounded-full bg-barca-gold/15 px-3 py-1.5 text-xs font-semibold text-barca-gold ring-1 ring-barca-gold/40 transition hover:bg-barca-gold/25"
            >
              Browse all teams →
            </Link>
          </div>
        </div>
      </>
    );
  }

  if (matches && matches.length === 0) {
    return (
      <>
        {heading}
        <div className={`${edge} rounded-xl bg-ink-soft border border-ink-line p-4 text-center text-sm text-ink-muted`}>
          No upcoming or recent matches for your teams right now.
        </div>
      </>
    );
  }

  return (
    <>
      {heading}
      <div className={`${flush ? "px-4 lg:px-0" : "px-4"} space-y-2`}>
        {(matches ?? []).map((m) => (
          <MatchCard key={m.slug} match={m} />
        ))}
        {matches === null &&
          [0, 1].map((i) => (
            <div key={i} className="h-[68px] rounded-xl bg-ink-soft border border-ink-line animate-pulse" />
          ))}
      </div>
    </>
  );
}
