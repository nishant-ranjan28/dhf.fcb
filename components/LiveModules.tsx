import type { Match } from "@/lib/types";
import type { CommentaryLine, Momentum } from "@/lib/match/commentary";

function eventIcon(t: CommentaryLine["type"]): string {
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

/** Big, pulsing live header: minute front-and-centre + last-event ticker. */
export function LiveStatusHero({
  status,
  minute,
  lastLine,
}: {
  status: Match["status"];
  minute: number;
  lastLine: CommentaryLine | null;
}) {
  if (status !== "LIVE" && status !== "HT") return null;
  return (
    <div className="mt-3 rounded-xl border border-live/40 bg-live/10 px-4 py-3">
      <div className="flex items-center justify-center gap-2">
        <span className="relative inline-flex h-2.5 w-2.5">
          <span className="absolute inset-0 rounded-full bg-live animate-ping opacity-75" />
          <span className="relative rounded-full h-2.5 w-2.5 bg-live" />
        </span>
        {status === "HT" ? (
          <span className="text-sm font-bold tracking-wide text-amber-400">HALF TIME</span>
        ) : (
          <span className="text-sm font-bold tracking-wide text-live">
            LIVE · <span className="font-mono tabular-nums">{minute}&apos;</span>
          </span>
        )}
      </div>
      {lastLine && (
        <p className="mt-1.5 text-center text-[12px] text-white truncate">
          <span aria-hidden>{eventIcon(lastLine.type)}</span> {lastLine.minute}&apos; {lastLine.text}
        </p>
      )}
    </div>
  );
}

/** Live momentum split bar. Honest "vibe" indicator from recent events. */
export function MomentumBar({
  momentum,
  home,
  away,
}: {
  momentum: Momentum;
  home: string;
  away: string;
}) {
  return (
    <div className="mt-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-2 px-1">
        Momentum
      </h2>
      <div className="rounded-xl bg-ink-soft border border-ink-line p-3">
        <div className="flex items-center justify-between text-[11px] text-ink-muted mb-1.5">
          <span className="truncate">{home}</span>
          <span className="truncate text-right">{away}</span>
        </div>
        <div className="flex h-2.5 overflow-hidden rounded-full bg-ink">
          <span
            className="bg-barca-blue transition-all duration-700 ease-out"
            style={{ width: `${momentum.home}%` }}
            aria-hidden
          />
          <span
            className="bg-barca-red transition-all duration-700 ease-out"
            style={{ width: `${momentum.away}%` }}
            aria-hidden
          />
        </div>
        <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-white mt-1.5">
          <span>{momentum.home}%</span>
          <span>{momentum.away}%</span>
        </div>
      </div>
    </div>
  );
}

/** Horizontal pitch-clock timeline plotting goals/cards by minute. */
export function KeyMomentsTimeline({
  events,
  currentMinute,
}: {
  events: Match["events"];
  currentMinute: number;
}) {
  const plotted = events.filter((e) => e.type === "goal" || e.type === "red" || e.type === "yellow");
  if (plotted.length === 0) return null;
  const maxMinute = Math.min(120, Math.max(90, currentMinute, ...plotted.map((e) => e.minute)));
  const pos = (m: number) => `${Math.min(100, (m / maxMinute) * 100)}%`;

  return (
    <div className="mt-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-2 px-1">
        Key moments
      </h2>
      <div className="rounded-xl bg-ink-soft border border-ink-line px-3 pt-6 pb-6">
        <div className="relative h-0.5 bg-ink-line">
          {/* Half-time marker */}
          <span className="absolute top-0 h-0.5 w-px bg-ink-muted/40" style={{ left: pos(45) }} />
          {plotted.map((e, i) => (
            <span
              key={i}
              className="absolute -translate-x-1/2"
              style={{
                left: pos(e.minute),
                top: e.team === "home" ? "-1.25rem" : "0.5rem",
              }}
              title={`${e.minute}' ${e.player}`}
            >
              <span className="flex flex-col items-center">
                <span className="text-sm leading-none" aria-hidden>{eventIcon(e.type)}</span>
                <span className="text-[9px] font-mono text-ink-muted">{e.minute}&apos;</span>
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Narrative commentary feed, newest event first. */
export function CommentaryFeed({ lines }: { lines: CommentaryLine[] }) {
  if (lines.length === 0) return null;
  return (
    <div className="mt-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-2 px-1">
        Commentary
      </h2>
      <ul className="rounded-xl bg-ink-soft border border-ink-line divide-y divide-ink-line">
        {lines.map((l, i) => (
          <li
            key={i}
            className={`flex items-start gap-3 px-3 py-2.5 text-sm ${
              l.type === "goal" ? "bg-fifa-purple/5" : ""
            }`}
          >
            <span className="font-mono text-ink-muted w-8 flex-none tabular-nums">{l.minute}&apos;</span>
            <span aria-hidden className="flex-none">{eventIcon(l.type)}</span>
            <span className={l.type === "goal" ? "text-white font-medium" : "text-white"}>{l.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
