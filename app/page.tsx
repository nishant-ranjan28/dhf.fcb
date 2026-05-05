import { LiveMatches } from "@/components/LiveMatches";
import { TelegramCTA } from "@/components/TelegramCTA";
import { SectionTitle } from "@/components/SectionTitle";
import { NewsCard } from "@/components/NewsCard";
import { MatchCard } from "@/components/MatchCard";
import { AdSlot } from "@/components/AdSlot";
import {
  getLiveMatches,
  getMatchesByCompetition,
  getTrendingMatches,
  getUpcomingMatches,
} from "@/lib/football";
import { listNews } from "@/lib/news";

export const revalidate = 60;

export default async function HomePage() {
  const [live, barcaNews, fifaUpcoming, fifaLive, trending] = await Promise.all([
    getLiveMatches(),
    listNews("barca", 5),
    getUpcomingMatches(3),
    getMatchesByCompetition("fifa"),
    getTrendingMatches(4),
  ]);

  const fifaQuick = fifaLive
    .filter((m) => m.status === "LIVE" || m.status === "HT" || m.status === "FT")
    .slice(0, 3);

  return (
    <>
      <SectionTitle title="Live Matches" href="/live" />
      <LiveMatches matches={live} />

      <TelegramCTA />

      <AdSlot size="320x100" />

      <SectionTitle title="Barca Feed" href="/barca" />
      <div className="px-4 space-y-2">
        {barcaNews.map((p) => (
          <NewsCard key={p.id} post={p} />
        ))}
      </div>

      <AdSlot size="300x250" />

      <SectionTitle title="FIFA · Upcoming" href="/fifa" />
      <div className="px-4 space-y-2">
        {fifaUpcoming.map((m) => (
          <MatchCard key={m.slug} match={m} />
        ))}
      </div>

      {fifaQuick.length > 0 && (
        <>
          <SectionTitle title="FIFA · Quick scores" href="/fifa" />
          <div className="px-4 space-y-2">
            {fifaQuick.map((m) => (
              <MatchCard key={m.slug} match={m} />
            ))}
          </div>
        </>
      )}

      <SectionTitle title="Trending" />
      <div className="px-4 space-y-2 pb-2">
        {trending.map((m) => (
          <MatchCard key={m.slug} match={m} />
        ))}
      </div>
    </>
  );
}
