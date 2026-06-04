import type { Match } from "@/lib/types";
import { KickoffCountdown } from "./KickoffCountdown";
import { LocalTime } from "./LocalTime";

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <span className="text-[11px] uppercase tracking-wide text-ink-muted">{label}</span>
      <span className="text-sm text-white text-right truncate">{value}</span>
    </div>
  );
}

export function MatchFacts({ match }: { match: Match }) {
  const isScheduled = match.status === "SCHED";

  return (
    <section className="px-4 mt-4">
      {isScheduled && (
        <div className="rounded-2xl border border-fifa-purple/40 bg-gradient-to-br from-fifa-purple/25 via-ink-soft to-ink p-4 mb-3">
          <p className="text-center text-[11px] font-semibold uppercase tracking-wider text-fifa-purple mb-3">
            Kick-off in
          </p>
          <KickoffCountdown kickoff={match.kickoff} />
        </div>
      )}

      <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-2 px-1">
        Match info
      </h2>
      <div className="rounded-xl bg-ink-soft border border-ink-line divide-y divide-ink-line">
        <Fact label="Competition" value={match.competitionName} />
        {match.round && <Fact label="Round" value={match.round} />}
        {match.group && <Fact label="Group" value={match.group} />}
        <Fact label="Kick-off" value={<LocalTime iso={match.kickoff} preset="datetime" />} />
        {match.venue && <Fact label="Venue" value={match.venue} />}
      </div>
    </section>
  );
}
