import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateMatchInsights, _parseInsights } from "@/lib/ai/groq";
import { resetEnvCache } from "@/lib/env";
import type { Match } from "@/lib/types";

function fakeMatch(overrides: Partial<Match> = {}): Match {
  return {
    slug: "argentina-vs-brazil",
    competition: "fifa",
    competitionName: "World Cup 2026",
    group: "Group B",
    home: { name: "Argentina", short: "ARG" },
    away: { name: "Brazil", short: "BRA" },
    scoreHome: 1,
    scoreAway: 0,
    status: "LIVE",
    minute: 30,
    kickoff: "2026-06-12T18:00:00.000Z",
    venue: "Estadio Azteca",
    events: [{ minute: 18, type: "goal", team: "home", player: "Messi" }],
    stats: {
      possession: { home: 55, away: 45 },
      shots: { home: 6, away: 3 },
      shotsOnTarget: { home: 3, away: 1 },
      corners: { home: 2, away: 1 },
      fouls: { home: 0, away: 0 },
    },
    lineupHome: { formation: "4-3-3", starting: [] },
    lineupAway: { formation: "4-2-3-1", starting: [] },
    ...overrides,
  };
}

function mockGroqResponse(payload: unknown) {
  return vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  delete process.env.GROQ_API_KEY;
  delete process.env.GROQ_MODEL;
  resetEnvCache();
});

describe("_parseInsights", () => {
  it("keeps a well-formed payload", () => {
    const out = _parseInsights({
      headline: "Messi strikes early",
      blurb: "Argentina lead through a trademark Messi finish.",
      trivia: ["Fact one", "Fact two", ""],
    });
    expect(out.headline).toBe("Messi strikes early");
    expect(out.trivia).toEqual(["Fact one", "Fact two"]); // empties dropped
  });

  it("coerces a bare array of facts", () => {
    const out = _parseInsights({ trivia: ["a", "b"] });
    expect(out.trivia).toEqual(["a", "b"]);
    expect(out.headline).toBe("");
  });

  it("caps trivia to a sane number and trims", () => {
    const out = _parseInsights({ trivia: Array.from({ length: 20 }, (_, i) => ` fact ${i} `) });
    expect(out.trivia.length).toBeLessThanOrEqual(6);
    expect(out.trivia[0]).toBe("fact 0");
  });

  it("returns empty insights for garbage", () => {
    expect(_parseInsights(null).trivia).toEqual([]);
    expect(_parseInsights("nope").trivia).toEqual([]);
  });
});

describe("generateMatchInsights", () => {
  it("returns null when no API key is configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await generateMatchInsights(fakeMatch())).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls Groq with bearer auth + json mode and parses the result", async () => {
    process.env.GROQ_API_KEY = "gsk_test";
    resetEnvCache();
    const fetchMock = mockGroqResponse({
      headline: "El Clásico of the Americas",
      blurb: "Argentina edge ahead.",
      trivia: ["Messi opened the scoring on 18 minutes."],
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await generateMatchInsights(fakeMatch());
    expect(out?.headline).toBe("El Clásico of the Americas");
    expect(out?.trivia).toHaveLength(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("api.groq.com");
    const headers = init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer gsk_test");
    const body = JSON.parse(init!.body as string);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages[1].content).toContain("Argentina");
    expect(body.messages[1].content).toContain("Brazil");
  });

  it("returns null (does not throw) on an API error", async () => {
    process.env.GROQ_API_KEY = "gsk_test";
    resetEnvCache();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("rate limited", { status: 429 })),
    );
    expect(await generateMatchInsights(fakeMatch())).toBeNull();
  });
});
