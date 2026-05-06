import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchFootballDataMatches } from "@/lib/football/providers/footballData";

describe("fetchFootballDataMatches", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("sends X-Auth-Token header and returns mapped matches", async () => {
    const json = {
      matches: [
        {
          id: 1,
          competition: { code: "PD", name: "LaLiga" },
          utcDate: "2026-05-06T20:00:00Z",
          status: "FINISHED",
          homeTeam: { id: 81, name: "FC Barcelona", tla: "BAR" },
          awayTeam: { id: 86, name: "Real Madrid", tla: "RMA" },
          score: { fullTime: { home: 2, away: 1 } },
        },
      ],
    };
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify(json), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const out = await fetchFootballDataMatches({ apiKey: "test-key" });
    expect(fetchMock).toHaveBeenCalled();
    const call = fetchMock.mock.calls[0];
    expect(call[1]?.headers).toMatchObject({ "X-Auth-Token": "test-key" });
    expect(out).toHaveLength(1);
    expect(out[0].slug).toBe("fc-barcelona-vs-real-madrid");
  });

  it("throws on non-200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 429 })),
    );
    await expect(fetchFootballDataMatches({ apiKey: "k" })).rejects.toThrow();
  });
});
