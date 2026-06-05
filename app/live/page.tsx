import { SectionTitle } from "@/components/SectionTitle";
import { MatchCard } from "@/components/MatchCard";
import { MatchList } from "@/components/MatchList";
import { TelegramCTA } from "@/components/TelegramCTA";
import { getAllMatches } from "@/lib/football";

export const revalidate = 30;

export const metadata = {
  title: "Live Scores",
  description: "All live matches right now.",
};

export default async function LivePage() {
  const all = await getAllMatches();
  const live = all.filter((m) => m.status === "LIVE" || m.status === "HT");
  const upcoming = all.filter((m) => m.status === "SCHED");
  const finished = all.filter((m) => m.status === "FT");

  return (
    <>
      <SectionTitle title="Live now" />
      {live.length === 0 ? (
        <p className="px-4 text-sm text-ink-muted">No matches in progress.</p>
      ) : (
        <div className="px-4 space-y-2">
          {live.map((m) => (
            <MatchCard key={m.slug} match={m} />
          ))}
        </div>
      )}

      <TelegramCTA />

      {upcoming.length > 0 && (
        <>
          <SectionTitle title="Coming up" />
          <MatchList matches={upcoming} />
        </>
      )}

      {finished.length > 0 && (
        <>
          <SectionTitle title="Finished" />
          <MatchList matches={finished} />
        </>
      )}
    </>
  );
}
