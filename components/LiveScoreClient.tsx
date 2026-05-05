"use client";

import { useEffect, useState } from "react";
import type { Match } from "@/lib/types";

export function LiveScoreClient({ initial }: { initial: Match }) {
  const [match, setMatch] = useState<Match>(initial);

  useEffect(() => {
    if (match.status === "FT") return;
    let stopped = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/scores/${match.slug}`, { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { match: Match };
        if (!stopped && json.match) setMatch(json.match);
      } catch {
        // silent — next tick will retry
      }
    };
    const interval = setInterval(tick, 30_000);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [match.slug, match.status]);

  return (
    <section className="px-4">
      <div className="rounded-xl bg-ink-soft border border-ink-line p-4">
        <div className="text-[11px] uppercase tracking-wide text-ink-muted text-center mb-3">
          {match.competitionName}
          {match.venue ? ` · ${match.venue}` : ""}
        </div>
        <div className="grid grid-cols-3 items-center gap-2">
          <div className="text-center">
            <div className="text-base font-semibold text-white">{match.home.name}</div>
          </div>
          <div className="text-center">
            <div className="font-mono text-3xl tabular-nums text-white">
              {match.scoreHome} – {match.scoreAway}
            </div>
            <StatusLine status={match.status} minute={match.minute} kickoff={match.kickoff} />
          </div>
          <div className="text-center">
            <div className="text-base font-semibold text-white">{match.away.name}</div>
          </div>
        </div>
      </div>

      <Events events={match.events} home={match.home.name} away={match.away.name} />
      <Stats stats={match.stats} />
      <Lineups
        home={match.home.name}
        away={match.away.name}
        lineupHome={match.lineupHome}
        lineupAway={match.lineupAway}
      />
    </section>
  );
}

function StatusLine({
  status,
  minute,
  kickoff,
}: {
  status: Match["status"];
  minute: number;
  kickoff: string;
}) {
  if (status === "LIVE") {
    return (
      <div className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-bold text-live">
        <span className="relative inline-flex h-2 w-2">
          <span className="absolute inset-0 rounded-full bg-live animate-ping opacity-75" />
          <span className="relative rounded-full h-2 w-2 bg-live" />
        </span>
        LIVE · {minute}&apos;
      </div>
    );
  }
  if (status === "HT") return <div className="mt-1 text-[11px] font-bold text-amber-400">HALF TIME</div>;
  if (status === "FT") return <div className="mt-1 text-[11px] font-bold text-ink-muted">FULL TIME</div>;
  return (
    <div className="mt-1 text-[11px] text-ink-muted">
      KO {new Date(kickoff).toLocaleString([], { hour: "2-digit", minute: "2-digit" })}
    </div>
  );
}

function Events({
  events,
  home,
  away,
}: {
  events: Match["events"];
  home: string;
  away: string;
}) {
  if (events.length === 0) return null;
  return (
    <div className="mt-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-2 px-1">
        Timeline
      </h2>
      <ul className="rounded-xl bg-ink-soft border border-ink-line divide-y divide-ink-line">
        {events.map((e, i) => (
          <li key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span className="font-mono text-ink-muted w-9">{e.minute}&apos;</span>
            <span aria-hidden>{eventIcon(e.type)}</span>
            <span className="text-white">{e.player}</span>
            {e.detail && <span className="text-ink-muted text-[12px]">· {e.detail}</span>}
            <span className="ml-auto text-[11px] text-ink-muted truncate">
              {e.team === "home" ? home : away}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function eventIcon(t: Match["events"][number]["type"]): string {
  switch (t) {
    case "goal":
      return "⚽";
    case "yellow":
      return "🟨";
    case "red":
      return "🟥";
    case "sub":
      return "🔁";
  }
}

function Stats({ stats }: { stats: Match["stats"] }) {
  const rows: { label: string; home: number; away: number; pct?: boolean }[] = [
    { label: "Possession", home: stats.possession.home, away: stats.possession.away, pct: true },
    { label: "Shots", home: stats.shots.home, away: stats.shots.away },
    { label: "On target", home: stats.shotsOnTarget.home, away: stats.shotsOnTarget.away },
    { label: "Corners", home: stats.corners.home, away: stats.corners.away },
  ];
  return (
    <div className="mt-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-2 px-1">
        Stats
      </h2>
      <div className="rounded-xl bg-ink-soft border border-ink-line divide-y divide-ink-line">
        {rows.map((r) => (
          <div key={r.label} className="px-3 py-2">
            <div className="grid grid-cols-3 items-center text-sm">
              <span className="font-mono tabular-nums text-white">
                {r.home}
                {r.pct ? "%" : ""}
              </span>
              <span className="text-center text-[11px] uppercase text-ink-muted tracking-wide">
                {r.label}
              </span>
              <span className="text-right font-mono tabular-nums text-white">
                {r.away}
                {r.pct ? "%" : ""}
              </span>
            </div>
            {r.pct && (
              <div className="mt-1 h-1 rounded bg-ink-line overflow-hidden flex">
                <span
                  className="bg-barca-blue"
                  style={{ width: `${r.home}%` }}
                  aria-hidden
                />
                <span
                  className="bg-barca-red"
                  style={{ width: `${r.away}%` }}
                  aria-hidden
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Lineups({
  home,
  away,
  lineupHome,
  lineupAway,
}: {
  home: string;
  away: string;
  lineupHome: Match["lineupHome"];
  lineupAway: Match["lineupAway"];
}) {
  if (lineupHome.starting.length === 0 && lineupAway.starting.length === 0) return null;
  return (
    <div className="mt-4 mb-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-2 px-1">
        Lineups
      </h2>
      <div className="grid grid-cols-2 gap-2">
        <LineupCol team={home} lineup={lineupHome} />
        <LineupCol team={away} lineup={lineupAway} />
      </div>
    </div>
  );
}

function LineupCol({ team, lineup }: { team: string; lineup: Match["lineupHome"] }) {
  return (
    <div className="rounded-xl bg-ink-soft border border-ink-line p-3">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-xs font-semibold text-white truncate">{team}</span>
        <span className="text-[10px] text-ink-muted">{lineup.formation}</span>
      </div>
      {lineup.starting.length === 0 ? (
        <p className="text-[12px] text-ink-muted">Lineup TBA</p>
      ) : (
        <ul className="space-y-1">
          {lineup.starting.map((p) => (
            <li key={p} className="text-[13px] text-white truncate">
              {p}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
