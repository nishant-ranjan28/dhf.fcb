import Link from "next/link";
import type { Match } from "@/lib/types";

function statusBadge(m: Match) {
  if (m.status === "LIVE") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-live">
        <span className="relative inline-flex h-2 w-2">
          <span className="absolute inset-0 rounded-full bg-live animate-ping opacity-75" />
          <span className="relative rounded-full h-2 w-2 bg-live" />
        </span>
        LIVE · {m.minute}&apos;
      </span>
    );
  }
  if (m.status === "HT") return <span className="text-[11px] font-bold text-amber-400">HT</span>;
  if (m.status === "FT") return <span className="text-[11px] font-bold text-ink-muted">FT</span>;
  return (
    <span className="text-[11px] text-ink-muted">
      {new Date(m.kickoff).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
    </span>
  );
}

export function MatchCard({ match }: { match: Match }) {
  const live = match.status === "LIVE" || match.status === "HT";
  return (
    <Link
      href={`/match/${match.slug}`}
      className="block bg-ink-soft border border-ink-line rounded-xl p-3 active:scale-[0.99] transition"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] uppercase tracking-wide text-ink-muted truncate">
          {match.competitionName}
        </span>
        {statusBadge(match)}
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <Team name={match.home.name} align="left" />
        <Score
          home={match.scoreHome}
          away={match.scoreAway}
          live={live}
          scheduled={match.status === "SCHED"}
        />
        <Team name={match.away.name} align="right" />
      </div>
    </Link>
  );
}

function Team({ name, align }: { name: string; align: "left" | "right" }) {
  return (
    <div className={`flex items-center gap-2 ${align === "right" ? "justify-end" : ""}`}>
      <span className="text-sm font-semibold text-white truncate">{name}</span>
    </div>
  );
}

function Score({
  home,
  away,
  live,
  scheduled,
}: {
  home: number;
  away: number;
  live: boolean;
  scheduled: boolean;
}) {
  if (scheduled) {
    return <span className="text-ink-muted text-sm font-mono">vs</span>;
  }
  return (
    <span
      className={`px-2.5 py-0.5 rounded-md font-mono text-base tabular-nums ${
        live ? "text-white bg-live/20 ring-1 ring-live/40" : "text-white bg-ink/60"
      }`}
    >
      {home} – {away}
    </span>
  );
}
