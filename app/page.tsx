import { HomeHero } from "@/components/HomeHero";
import { CategoryTiles } from "@/components/CategoryTiles";
import { YourTeams } from "@/components/YourTeams";
import { TelegramCTA } from "@/components/TelegramCTA";
import { SectionTitle } from "@/components/SectionTitle";
import { NewsCard } from "@/components/NewsCard";
import { BlogCard } from "@/components/BlogCard";
import { MatchCard } from "@/components/MatchCard";
import { AdSlot } from "@/components/AdSlot";
import { CountdownTimer } from "@/components/CountdownTimer";
import { PollCard } from "@/components/PollCard";
import { StandingsTable } from "@/components/StandingsTable";
import { TopScorers } from "@/components/TopScorers";
import { HighlightsReel } from "@/components/HighlightsReel";
import {
  getAllMatches,
  getMatchesByCompetition,
  getTrendingMatches,
  getUpcomingMatches,
} from "@/lib/football";
import { listNews } from "@/lib/news";
import { computeStandings } from "@/lib/standings";
import { getPoll } from "@/lib/poll/polls";
import { blogStore } from "@/lib/blog/store";
import { viewStore } from "@/lib/blog/views";
import { highlightsStore } from "@/lib/highlights/store";
import { FEATURED_PLAYERS } from "@/data/fifa-featured";

export const revalidate = 60;

/** In-feed unit: phone gets a 300x250, desktop a 728x90 leaderboard. */
function FeedAd() {
  return (
    <>
      <div className="lg:hidden">
        <AdSlot size="300x250" />
      </div>
      <div className="hidden lg:block">
        <AdSlot size="728x90" />
      </div>
    </>
  );
}

export default async function HomePage() {
  const [allMatches, fifaMatches, upcomingAll, trending, barcaNews, fifaNews, blogs, highlights] =
    await Promise.all([
      getAllMatches(),
      getMatchesByCompetition("fifa"),
      getUpcomingMatches(3),
      getTrendingMatches(4),
      listNews("barca", 6, { langs: ["en"] }),
      listNews("fifa", 4, { langs: ["en"] }),
      blogStore().list({ limit: 6 }),
      highlightsStore().list(),
    ]);

  const views = blogs.length ? await viewStore().getBatch(blogs.map((p) => p.slug)) : {};

  const live = allMatches
    .filter((m) => m.status === "LIVE" || m.status === "HT")
    .slice(0, 4);
  const recent = allMatches
    .filter((m) => m.status === "FT")
    .sort((a, b) => +new Date(b.kickoff) - +new Date(a.kickoff))
    .slice(0, 4);
  const fifaUpcoming = fifaMatches
    .filter((m) => m.status === "SCHED")
    .sort((a, b) => +new Date(a.kickoff) - +new Date(b.kickoff));
  const standings = computeStandings(fifaMatches).slice(0, 2);
  const poll = getPoll("wc-2026-winner");
  // When nothing is live, show real results instead of an empty-state box.
  const headlineMatches = live.length > 0 ? live : recent;

  return (
    // [data-wide-layout] opts the home page into the same 1120px desktop shell
    // as /blog (see globals.css). Mobile keeps the original single-column flow.
    <div data-wide-layout>
      <div className="lg:max-w-[820px]">
        <HomeHero />
        <CategoryTiles />
      </div>

      <YourTeams />

      {/* Interactive quick facts: next kick-off and the fan poll sit side by
          side on desktop, stacked on mobile. */}
      {(fifaUpcoming[0] || poll) && (
        <div className="lg:grid lg:grid-cols-2 lg:gap-4 lg:px-4">
          <div>{fifaUpcoming[0] && <CountdownTimer match={fifaUpcoming[0]} flush />}</div>
          <div>{poll && <PollCard poll={poll} flush />}</div>
        </div>
      )}

      {headlineMatches.length > 0 && (
        <>
          <SectionTitle
            title={live.length > 0 ? "Live Matches" : "Latest Results"}
            href="/live"
            accent="live"
          />
          <div className="px-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {headlineMatches.map((m) => (
              <MatchCard key={m.slug} match={m} />
            ))}
          </div>
        </>
      )}

      <TelegramCTA />
      <FeedAd />

      {blogs.length > 0 && (
        <>
          <SectionTitle title="Latest Stories" href="/blog" accent="gold" />
          <div className="px-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {blogs.map((p) => (
              <BlogCard key={p.slug} post={p} views={views[p.slug] ?? 0} />
            ))}
          </div>
          <FeedAd />
        </>
      )}

      {barcaNews.length > 0 && (
        <>
          <SectionTitle title="Barca Feed" href="/barca" accent="blue" />
          <div className="px-4 grid grid-cols-1 md:grid-cols-2 gap-2">
            {barcaNews.map((p) => (
              <NewsCard key={p.id} post={p} />
            ))}
          </div>
        </>
      )}

      <FeedAd />

      {fifaNews.length > 0 && (
        <>
          <SectionTitle title="World Cup News" href="/fifa" accent="purple" />
          <div className="px-4 grid grid-cols-1 md:grid-cols-2 gap-2">
            {fifaNews.map((p) => (
              <NewsCard key={p.id} post={p} />
            ))}
          </div>
        </>
      )}

      {standings.length > 0 && (
        <>
          <SectionTitle title="Group Standings" href="/fifa" accent="purple" />
          <div className="max-w-[720px]">
            <StandingsTable groups={standings} />
          </div>
        </>
      )}

      <FeedAd />

      <SectionTitle title="Top Scorers" href="/fifa" accent="gold" />
      <TopScorers players={FEATURED_PLAYERS} />

      {highlights.length > 0 && (
        <>
          <SectionTitle title="Highlights" href="/fifa" accent="red" />
          <HighlightsReel highlights={highlights.slice(0, 6)} />
        </>
      )}

      {upcomingAll.length > 0 && (
        <>
          <SectionTitle title="Upcoming" href="/live" accent="blue" />
          <div className="px-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {upcomingAll.map((m) => (
              <MatchCard key={m.slug} match={m} />
            ))}
          </div>
        </>
      )}

      {trending.length > 0 && (
        <>
          <SectionTitle title="Trending" accent="gold" />
          <div className="px-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 pb-2">
            {trending.map((m) => (
              <MatchCard key={m.slug} match={m} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
