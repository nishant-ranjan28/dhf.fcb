import { SectionTitle } from "@/components/SectionTitle";
import { NewsCard } from "@/components/NewsCard";
import { TelegramCTA } from "@/components/TelegramCTA";
import { AdSlot } from "@/components/AdSlot";
import { CountdownTimer } from "@/components/CountdownTimer";
import { PollCard } from "@/components/PollCard";
import { FixturesTabs } from "@/components/FixturesTabs";
import { StandingsTable } from "@/components/StandingsTable";
import { HighlightsReel } from "@/components/HighlightsReel";
import { TopScorers } from "@/components/TopScorers";
import { getMatchesByCompetition } from "@/lib/football";
import { listNews } from "@/lib/news";
import { computeStandings } from "@/lib/standings";
import { highlightsStore } from "@/lib/highlights/store";
import { getPoll } from "@/lib/poll/polls";
import { FEATURED_PLAYERS } from "@/data/fifa-featured";

export const revalidate = 60;

export const metadata = {
  title: "FIFA World Cup — Live scores, fixtures & news",
  description: "World Cup live scores, upcoming fixtures and latest tournament news.",
};

export default async function FifaPage() {
  const [posts, matches, highlights] = await Promise.all([
    listNews("fifa", 20, { langs: ["en"] }),
    getMatchesByCompetition("fifa"),
    highlightsStore().list(),
  ]);

  const live = matches.filter((m) => m.status === "LIVE" || m.status === "HT");
  const upcoming = matches
    .filter((m) => m.status === "SCHED")
    .sort((a, b) => +new Date(a.kickoff) - +new Date(b.kickoff));
  const recent = matches
    .filter((m) => m.status === "FT")
    .sort((a, b) => +new Date(b.kickoff) - +new Date(a.kickoff));

  const standings = computeStandings(matches);
  const nextMatch = upcoming[0];
  const poll = getPoll("wc-2026-winner");

  return (
    <>
      {nextMatch && <CountdownTimer match={nextMatch} />}

      <TelegramCTA />

      {poll && <PollCard poll={poll} />}

      <SectionTitle title="Fixtures" />
      <FixturesTabs live={live} upcoming={upcoming} results={recent} />

      {highlights.length > 0 && (
        <>
          <SectionTitle title="Highlights" />
          <HighlightsReel highlights={highlights} />
        </>
      )}

      {standings.length > 0 && (
        <>
          <SectionTitle title="Group standings" />
          <StandingsTable groups={standings} />
        </>
      )}

      <AdSlot size="300x250" />

      <SectionTitle title="Top scorers" />
      <TopScorers players={FEATURED_PLAYERS} />

      <SectionTitle title="World Cup News" />
      <div className="px-4 space-y-2 pb-2">
        {posts.map((p) => (
          <NewsCard key={p.id} post={p} />
        ))}
      </div>
    </>
  );
}
