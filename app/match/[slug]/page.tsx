import { notFound } from "next/navigation";
import Link from "next/link";
import { LiveScoreClient } from "@/components/LiveScoreClient";
import { TelegramCTA } from "@/components/TelegramCTA";
import { AdSlot } from "@/components/AdSlot";
import { getAllMatches, getMatchBySlug } from "@/lib/football";
import { env } from "@/lib/env";
import type { Metadata } from "next";

export const revalidate = 30;

export async function generateStaticParams() {
  const all = await getAllMatches();
  return all.map((m) => ({ slug: m.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const m = await getMatchBySlug(slug);
  if (!m) return { title: "Match not found" };
  const title = `${m.home.name} ${m.scoreHome}-${m.scoreAway} ${m.away.name} · ${m.competitionName}`;
  return {
    title,
    description: `${m.competitionName} — live score, lineups, timeline and stats.`,
  };
}

export default async function MatchPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const match = await getMatchBySlug(slug);
  if (!match) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: `${match.home.name} vs ${match.away.name}`,
    startDate: match.kickoff,
    sport: "Soccer",
    url: `${env.siteUrl}/match/${match.slug}`,
    ...(match.venue && {
      location: { "@type": "Place", name: match.venue },
    }),
    homeTeam: { "@type": "SportsTeam", name: match.home.name, sport: "Soccer" },
    awayTeam: { "@type": "SportsTeam", name: match.away.name, sport: "Soccer" },
    eventStatus:
      match.status === "FT"
        ? "https://schema.org/EventCompleted"
        : match.status === "LIVE" || match.status === "HT"
          ? "https://schema.org/EventInProgress"
          : "https://schema.org/EventScheduled",
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="px-4 mt-3">
        <Link href="/" className="text-xs text-ink-muted">
          ← Back
        </Link>
      </div>

      <div className="mt-2">
        <LiveScoreClient initial={match} />
      </div>

      <TelegramCTA />
      <AdSlot size="300x250" />
    </>
  );
}
