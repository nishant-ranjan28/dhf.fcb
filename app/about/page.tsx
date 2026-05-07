import Link from "next/link";

export const metadata = {
  title: "About BarcaPulse",
  description:
    "BarcaPulse is an independent fan site covering FC Barcelona and the FIFA World Cup with live scores, news, and longform writing.",
};

export default function AboutPage() {
  return (
    <article className="prose-blog px-4 mt-4 mb-12">
      <h1>About BarcaPulse</h1>

      <p>
        BarcaPulse is an independent fan site dedicated to <strong>FC Barcelona</strong>{" "}
        and the <strong>FIFA World Cup</strong>. We bring together live scores, lineups,
        match timelines, news from leading outlets, and original longform writing in one
        mobile-first place.
      </p>

      <h2>What we cover</h2>
      <ul>
        <li>Live and upcoming Barcelona matches across LaLiga and the UEFA Champions League</li>
        <li>FIFA World Cup fixtures, scores, and tournament news</li>
        <li>Match-by-match goals, cards, substitutions, lineups, and stats</li>
        <li>Curated news from BBC Sport, The Guardian, Marca, Mundo Deportivo and r/Barca</li>
        <li>Original blog posts: tactical analysis, opinion, and longform features</li>
      </ul>

      <h2>How we work</h2>
      <p>
        Live data and fixtures come from{" "}
        <a href="https://www.football-data.org" target="_blank" rel="noopener noreferrer">
          football-data.org
        </a>{" "}
        and{" "}
        <a href="https://www.api-football.com" target="_blank" rel="noopener noreferrer">
          API-Football
        </a>
        . News headlines are aggregated from publicly-available RSS feeds; we link to the
        original article for the full story. Original commentary on the blog is written
        by the BarcaPulse editorial team.
      </p>

      <h2>Not affiliated</h2>
      <p>
        BarcaPulse is an unofficial fan site.{" "}
        <strong>It is not affiliated with, endorsed by, or sponsored by</strong>{" "}
        Futbol Club Barcelona, FIFA, UEFA, or any of the news publishers we link to.
        All trademarks, club crests, league logos, and player imagery remain the property
        of their respective owners and are used here under fair-use editorial-commentary
        principles.
      </p>

      <h2>Stay in touch</h2>
      <p>
        Get fastest goal alerts and headlines via our{" "}
        <a
          href={process.env.NEXT_PUBLIC_TELEGRAM_URL ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
        >
          Telegram channel
        </a>
        . Editorial questions, takedown requests, or partnership inquiries:{" "}
        <a href="mailto:hello@dhfbarca.com">hello@dhfbarca.com</a>.
      </p>

      <p className="text-[12px] text-ink-muted">
        See also: <Link href="/privacy">Privacy</Link> ·{" "}
        <Link href="/terms">Terms</Link>
      </p>
    </article>
  );
}
