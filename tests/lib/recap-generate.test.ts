import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildRecapPrompt, generateRecap } from "@/lib/recap/generate";
import type { Match } from "@/lib/types";

function match(over: Partial<Match> = {}): Match {
  return {
    slug: "barcelona-vs-real-madrid",
    competition: "barca",
    competitionName: "LaLiga",
    home: { name: "FC Barcelona", short: "BAR" },
    away: { name: "Real Madrid", short: "RMA" },
    scoreHome: 2,
    scoreAway: 1,
    status: "FT",
    minute: 90,
    kickoff: "2026-03-01T20:00:00.000Z",
    venue: "Spotify Camp Nou",
    events: [
      { minute: 12, type: "goal", team: "home", player: "Lewandowski" },
      { minute: 41, type: "goal", team: "away", player: "Bellingham" },
      { minute: 58, type: "goal", team: "home", player: "Yamal" },
    ],
    stats: {
      possession: { home: 58, away: 42 },
      shots: { home: 14, away: 9 },
      shotsOnTarget: { home: 6, away: 3 },
      corners: { home: 5, away: 2 },
      fouls: { home: 0, away: 0 },
    },
    lineupHome: { formation: "4-3-3", starting: [] },
    lineupAway: { formation: "4-3-1-2", starting: [] },
    ...over,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  delete process.env.GEMINI_API_KEY;
  delete process.env.GROQ_API_KEY;
});

describe("buildRecapPrompt", () => {
  it("includes teams, final score and the actual events", () => {
    const p = buildRecapPrompt(match());
    expect(p).toContain("FC Barcelona");
    expect(p).toContain("Real Madrid");
    expect(p).toContain("2-1");
    expect(p).toContain("Lewandowski");
    expect(p).toContain("Bellingham");
    // Anti-hallucination instruction must be present.
    expect(p.toLowerCase()).toContain("do not invent");
  });

  it("notes when no events are available (score-only recap)", () => {
    const p = buildRecapPrompt(match({ events: [] }));
    expect(p.toLowerCase()).toContain("no detailed events");
  });
});

function groqOk(payload: unknown) {
  return vi.fn(
    async (_u: string | URL | Request, _i?: RequestInit) =>
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );
}

const DRAFT = {
  title: "Barça edge El Clásico",
  body: "x".repeat(10),
  excerpt: "A late winner.",
  tags: ["barca", "clasico"],
};

describe("generateRecap", () => {
  it("returns all_providers_failed when no AI keys are set", async () => {
    const res = await generateRecap(match());
    expect(res.ok).toBe(false);
  });

  it("generates via Groq and tags the provider", async () => {
    process.env.GROQ_API_KEY = "gsk_test";
    const fetchMock = groqOk(DRAFT);
    vi.stubGlobal("fetch", fetchMock);

    const res = await generateRecap(match());
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.draft.title).toBe("Barça edge El Clásico");
      expect(res.draft.provider).toBe("groq");
    }
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("returns failure (no throw) on API error", async () => {
    process.env.GROQ_API_KEY = "gsk_test";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    const res = await generateRecap(match());
    expect(res.ok).toBe(false);
  });
});
