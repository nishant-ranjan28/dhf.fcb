"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MatchCard } from "./MatchCard";
import { useFollows } from "./follows/store";
import type { Match } from "@/lib/types";

export function YourTeams() {
  const follows = useFollows();
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

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

  // Don't render anything on the server / first paint — this is a personalised,
  // client-only section keyed off localStorage.
  if (!mounted) return null;

  const heading = (
    <div className="flex items-baseline justify-between mt-6 mb-2 px-4">
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
        <Link href="/teams" className="block mx-4">
          <div className="rounded-xl border border-dashed border-ink-line bg-ink-soft p-4 text-center text-sm text-ink-muted hover:text-white hover:border-white/30 transition">
            ⭐ Follow your favourite teams to see their matches here.
          </div>
        </Link>
      </>
    );
  }

  if (matches && matches.length === 0) {
    return (
      <>
        {heading}
        <div className="mx-4 rounded-xl bg-ink-soft border border-ink-line p-4 text-center text-sm text-ink-muted">
          No upcoming or recent matches for your teams right now.
        </div>
      </>
    );
  }

  return (
    <>
      {heading}
      <div className="px-4 space-y-2">
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
