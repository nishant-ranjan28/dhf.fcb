import Link from "next/link";
import { autopostState } from "@/lib/autopost/state";
import { recapState } from "@/lib/recap/state";
import { insightsCountToday } from "@/lib/ai/insights";
import { POLLS } from "@/lib/poll/polls";
import { pollStore } from "@/lib/poll/store";
import { predictionsStore } from "@/lib/predictions/store";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

function Tile({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="bg-ink-soft border border-ink-line rounded-lg p-3">
      <div className="text-[11px] uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {hint && <div className="text-[11px] text-ink-muted mt-0.5">{hint}</div>}
    </div>
  );
}

function SectionHead({ title }: { title: string }) {
  return (
    <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted mt-6 mb-2">{title}</h2>
  );
}

export default async function AdminDashboard() {
  const [days, recapToday, recapTotal, insightsToday, predStats, topPlayers] = await Promise.all([
    autopostState().recentStats(7),
    recapState().publishedToday(),
    recapState().totalRecapped(),
    insightsCountToday(),
    predictionsStore().stats(),
    predictionsStore().leaderboard(5),
  ]);

  const ap = days.reduce(
    (a, d) => ({
      published: a.published + d.published,
      errors: a.errors + d.errors,
      by_gemini: a.by_gemini + d.by_gemini,
      by_groq: a.by_groq + d.by_groq,
    }),
    { published: 0, errors: 0, by_gemini: 0, by_groq: 0 },
  );

  const polls = await Promise.all(
    Object.values(POLLS).map(async (poll) => {
      const counts = await pollStore().results(poll.id, poll.options.map((o) => o.id));
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      const leader = poll.options
        .map((o) => ({ label: o.label, n: counts[o.id] ?? 0 }))
        .sort((a, b) => b.n - a.n)[0];
      return { question: poll.question, total, leader };
    }),
  );

  return (
    <div className="px-4 py-4">
      <h1 className="text-xl font-bold text-white mb-1">Dashboard</h1>
      <p className="text-[11px] text-ink-muted mb-2">
        AI {env.groqApiKey ? "✓ configured" : "✗ no GROQ key"} · live overview
      </p>

      <SectionHead title="AI content" />
      <div className="grid grid-cols-3 gap-2">
        <Tile label="Insights today" value={insightsToday} hint="fresh generations" />
        <Tile label="Recaps today" value={recapToday} hint={`${recapTotal} all-time`} />
        <Tile label="News posts 7d" value={ap.published} hint={`${ap.errors} errors`} />
      </div>
      <p className="text-[11px] text-ink-muted mt-2">
        News providers (7d): <span className="text-white">{ap.by_gemini}</span> Gemini ·{" "}
        <span className="text-white">{ap.by_groq}</span> Groq ·{" "}
        <Link href="/admin/autopost" className="text-barca-gold hover:text-white">
          full auto-post stats →
        </Link>
      </p>

      <SectionHead title="Predictions" />
      <div className="grid grid-cols-3 gap-2">
        <Tile label="Players" value={predStats.players} />
        <Tile label="Predictions" value={predStats.predictions} />
        <Tile label="Settled" value={predStats.settledMatches} hint="matches" />
      </div>
      {topPlayers.length > 0 && (
        <ol className="mt-2 text-sm text-ink-muted space-y-0.5">
          {topPlayers.map((p) => (
            <li key={p.deviceId}>
              <span className="text-white">{p.rank}. {p.name}</span> — {p.points} pts
            </li>
          ))}
        </ol>
      )}

      <SectionHead title="Polls" />
      {polls.length === 0 ? (
        <p className="text-sm text-ink-muted">No active polls.</p>
      ) : (
        <ul className="space-y-2">
          {polls.map((p) => (
            <li key={p.question} className="bg-ink-soft border border-ink-line rounded-lg p-3">
              <p className="text-sm text-white">{p.question}</p>
              <p className="text-[11px] text-ink-muted mt-1">
                {p.total} vote{p.total === 1 ? "" : "s"}
                {p.total > 0 && p.leader && (
                  <> · leading: <span className="text-white">{p.leader.label}</span> ({p.leader.n})</>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11px] text-ink-muted mt-6">
        Note: team follows are stored client-side only and aren&apos;t tracked server-side.
      </p>
    </div>
  );
}
