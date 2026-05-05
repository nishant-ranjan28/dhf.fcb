import { SectionTitle } from "@/components/SectionTitle";
import { NewsCard } from "@/components/NewsCard";
import { MatchCard } from "@/components/MatchCard";
import { TelegramCTA } from "@/components/TelegramCTA";
import { AdSlot } from "@/components/AdSlot";
import { getMatchesByCompetition } from "@/lib/football";
import { listNews } from "@/lib/news";

export const revalidate = 60;

export const metadata = {
  title: "FC Barcelona — News, fixtures & live scores",
  description: "Latest Barca news, lineups, live scores and timelines.",
};

export default async function BarcaPage() {
  const [posts, matches] = await Promise.all([
    listNews("barca", 20),
    getMatchesByCompetition("barca"),
  ]);

  const live = matches.filter((m) => m.status === "LIVE" || m.status === "HT");
  const upcoming = matches.filter((m) => m.status === "SCHED");
  const recent = matches.filter((m) => m.status === "FT");

  return (
    <>
      {live.length > 0 && (
        <>
          <SectionTitle title="Barca · Live" />
          <div className="px-4 space-y-2">
            {live.map((m) => (
              <MatchCard key={m.slug} match={m} />
            ))}
          </div>
        </>
      )}

      <TelegramCTA />

      <SectionTitle title="Latest News" />
      <div className="px-4 space-y-2">
        {posts.map((p) => (
          <NewsCard key={p.id} post={p} />
        ))}
      </div>

      <AdSlot size="300x250" />

      {upcoming.length > 0 && (
        <>
          <SectionTitle title="Upcoming" />
          <div className="px-4 space-y-2">
            {upcoming.map((m) => (
              <MatchCard key={m.slug} match={m} />
            ))}
          </div>
        </>
      )}

      {recent.length > 0 && (
        <>
          <SectionTitle title="Recent results" />
          <div className="px-4 space-y-2 pb-2">
            {recent.map((m) => (
              <MatchCard key={m.slug} match={m} />
            ))}
          </div>
        </>
      )}
    </>
  );
}
