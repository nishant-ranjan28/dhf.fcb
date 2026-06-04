"use client";

import { useState } from "react";
import { MatchCard } from "./MatchCard";
import type { Match } from "@/lib/types";

type TabKey = "live" | "upcoming" | "results";

export function FixturesTabs({
  live,
  upcoming,
  results,
}: {
  live: Match[];
  upcoming: Match[];
  results: Match[];
}) {
  const allTabs: { key: TabKey; label: string; matches: Match[] }[] = [
    { key: "live", label: "Live", matches: live },
    { key: "upcoming", label: "Upcoming", matches: upcoming },
    { key: "results", label: "Results", matches: results },
  ];
  const tabs = allTabs.filter((t) => t.matches.length > 0);

  const [active, setActive] = useState<TabKey>(tabs[0]?.key ?? "upcoming");
  const current = tabs.find((t) => t.key === active) ?? tabs[0];
  if (!current) return null;

  return (
    <div>
      <div className="flex gap-2 px-4 mb-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((t) => {
          const isActive = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActive(t.key)}
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                isActive
                  ? "bg-white text-ink"
                  : "bg-ink-soft text-ink-muted ring-1 ring-ink-line hover:text-white"
              }`}
            >
              {t.key === "live" && (
                <span className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-live" : "bg-live animate-pulse"}`} />
              )}
              {t.label}
              <span className={isActive ? "text-ink/50" : "text-ink-muted/70"}>{t.matches.length}</span>
            </button>
          );
        })}
      </div>

      <div className="px-4 space-y-2">
        {current.matches.map((m) => (
          <MatchCard key={m.slug} match={m} />
        ))}
      </div>
    </div>
  );
}
