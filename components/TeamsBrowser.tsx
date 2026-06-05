"use client";

import { useMemo, useState } from "react";
import { FollowButton } from "./FollowButton";
import { useFollows } from "./follows/store";
import type { FollowableTeam } from "@/lib/follows";

export function TeamsBrowser({ teams }: { teams: FollowableTeam[] }) {
  const follows = useFollows();
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const base = term ? teams.filter((t) => t.name.toLowerCase().includes(term)) : teams;
    const followed = new Set(follows);
    // Followed teams float to the top, otherwise alphabetical (already sorted).
    return [...base].sort((a, b) => {
      const fa = followed.has(a.name) ? 0 : 1;
      const fb = followed.has(b.name) ? 0 : 1;
      return fa - fb || a.name.localeCompare(b.name);
    });
  }, [teams, q, follows]);

  return (
    <div className="px-4">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Find a team…"
        className="w-full bg-ink-soft border border-ink-line rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-barca-gold"
      />
      <p className="mt-2 text-[11px] text-ink-muted">
        {follows.length} followed · {teams.length} teams
      </p>

      <ul className="mt-3 rounded-xl border border-ink-line bg-ink-soft divide-y divide-ink-line overflow-hidden">
        {filtered.map((t) => (
          <li key={t.name} className="flex items-center gap-3 px-3 py-2.5">
            <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-ink text-[10px] font-bold text-ink-muted ring-1 ring-ink-line">
              {t.short}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-white">{t.name}</p>
              <p className="text-[11px] text-ink-muted">{t.label}</p>
            </div>
            <FollowButton team={t.name} />
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-ink-muted">No teams match “{q.trim()}”.</li>
        )}
      </ul>
    </div>
  );
}
