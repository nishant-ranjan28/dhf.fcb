import { describe, it, expect } from "vitest";
import { searchAll } from "@/lib/search";
import type { Match, NewsPost } from "@/lib/types";
import type { BlogPost } from "@/lib/blog/types";

function match(home: string, away: string, over: Partial<Match> = {}): Match {
  return {
    slug: `${home}-vs-${away}`.toLowerCase().replace(/\s+/g, "-"),
    competition: "fifa",
    competitionName: "World Cup",
    home: { name: home, short: home.slice(0, 3).toUpperCase() },
    away: { name: away, short: away.slice(0, 3).toUpperCase() },
    scoreHome: 0,
    scoreAway: 0,
    status: "SCHED",
    minute: 0,
    kickoff: "2026-06-11T18:00:00.000Z",
    events: [],
    stats: {
      possession: { home: 50, away: 50 },
      shots: { home: 0, away: 0 },
      shotsOnTarget: { home: 0, away: 0 },
      corners: { home: 0, away: 0 },
      fouls: { home: 0, away: 0 },
    },
    lineupHome: { formation: "", starting: [] },
    lineupAway: { formation: "", starting: [] },
    ...over,
  };
}

const news = (id: string, title: string): NewsPost => ({
  id,
  slug: id,
  title,
  content: "body",
  category: "barca",
  createdAt: "2026-01-01T00:00:00Z",
});

const blog = (slug: string, title: string, tags: string[] = []): BlogPost => ({
  slug,
  title,
  excerpt: "",
  body: "",
  tags,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  author: "BarcaPulse",
});

const sources = {
  matches: [match("Mexico", "South Africa"), match("Argentina", "Brazil")],
  news: [news("n1", "Lewandowski signs new deal"), news("n2", "Yamal wins award")],
  blog: [blog("tactics", "Barça tactical preview", ["barca", "tactics"])],
};

describe("searchAll", () => {
  it("returns empty groups for a too-short query", () => {
    const r = searchAll("a", sources);
    expect(r).toEqual({ matches: [], news: [], blog: [] });
  });

  it("finds matches by team name (case-insensitive)", () => {
    const r = searchAll("brazil", sources);
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0].href).toBe("/match/argentina-vs-brazil");
    expect(r.matches[0].title).toContain("Brazil");
  });

  it("finds news by title", () => {
    const r = searchAll("lewandowski", sources);
    expect(r.news.map((h) => h.title)).toContain("Lewandowski signs new deal");
  });

  it("finds blog posts by title or tag", () => {
    expect(searchAll("tactical", sources).blog).toHaveLength(1);
    expect(searchAll("tactics", sources).blog).toHaveLength(1); // tag match
  });

  it("matches the competition name too", () => {
    const r = searchAll("world cup", sources);
    expect(r.matches.length).toBeGreaterThan(0);
  });

  it("returns nothing for a no-match query", () => {
    const r = searchAll("zzzznope", sources);
    expect(r).toEqual({ matches: [], news: [], blog: [] });
  });

  it("caps each group to the limit", () => {
    const many = {
      matches: Array.from({ length: 20 }, (_, i) => match(`Team${i}`, "United")),
      news: [],
      blog: [],
    };
    expect(searchAll("united", many, 8).matches).toHaveLength(8);
  });
});
