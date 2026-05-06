import { describe, it, expect, beforeEach, vi } from "vitest";

// Static fixtures (104 WC matches from the openfootball file on disk) would
// otherwise win the chain and mask the mock seeds these tests rely on. Stub
// to empty so the mock provider is what serves slug lookups here.
vi.mock("@/lib/football/providers/staticFixtures", () => ({
  loadStaticFixtures: vi.fn(async () => []),
  _resetStaticCache: vi.fn(),
}));

import { resetEnvCache } from "@/lib/env";
import { invalidate } from "@/lib/cache";
import {
  _resetEnrichmentState,
  getMatchBySlug,
  resetChain,
} from "@/lib/football";

const BARCA_SLUG = "fc-barcelona-vs-real-madrid";
const FIFA_SLUG = "argentina-vs-brazil";
const AF_HOST = "v3.football.api-sports.io";

function fixturesResponse() {
  return {
    response: [
      {
        fixture: { id: 12345, date: new Date().toISOString() },
        teams: {
          home: { id: 529, name: "Barcelona" },
          away: { id: 541, name: "Real Madrid" },
        },
        league: { id: 140, season: 2025 },
      },
    ],
  };
}

function eventsResponse() {
  return {
    response: [
      {
        time: { elapsed: 22 },
        team: { name: "Barcelona" },
        player: { name: "Yamal" },
        type: "Goal",
        detail: "Normal Goal",
      },
    ],
  };
}

function makeFetchMock() {
  return vi.fn(async (input: Request | URL | string) => {
    const url = String(input);
    if (url.includes("/fixtures/events")) {
      return new Response(JSON.stringify(eventsResponse()), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/fixtures?")) {
      return new Response(JSON.stringify(fixturesResponse()), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

function afCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter((c) => String(c[0]).includes(AF_HOST));
}

describe("getMatchBySlug enrichment", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.API_FOOTBALL_KEY;
    delete process.env.FOOTBALL_DATA_API_KEY;
    resetEnvCache();
    resetChain();
    _resetEnrichmentState();
    // matches list is cached process-wide; clear so each test rebuilds
    // through the freshly-configured chain.
    invalidate("matches:all");
  });

  it("does not call api-football when key is missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const m = await getMatchBySlug(BARCA_SLUG);
    expect(m).not.toBeNull();
    expect(afCalls(fetchMock)).toHaveLength(0);
  });

  it("enriches a live Barca match when key is set", async () => {
    process.env.API_FOOTBALL_KEY = "test-key";
    resetEnvCache();
    resetChain();

    const fetchMock = makeFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    const m = await getMatchBySlug(BARCA_SLUG);
    expect(m).not.toBeNull();
    const calls = afCalls(fetchMock);
    // One fixtures lookup + one events fetch.
    expect(calls).toHaveLength(2);
    expect(String(calls[0][0])).toContain("/fixtures?");
    expect(String(calls[0][0])).toContain("league=140");
    expect(String(calls[1][0])).toContain("/fixtures/events?fixture=12345");
    // Events from API-Football should have replaced the seed events.
    expect(m!.events).toEqual([
      {
        minute: 22,
        type: "goal",
        team: "home",
        player: "Yamal",
        detail: undefined,
      },
    ]);
  });

  it("returns base match unmodified when quota is exhausted", async () => {
    process.env.API_FOOTBALL_KEY = "test-key";
    resetEnvCache();
    resetChain();

    const fetchMock = makeFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    // Burn through the 90-req daily quota.
    for (let i = 0; i < 90; i++) {
      await getMatchBySlug(BARCA_SLUG);
      _resetEnrichmentState(); // force re-resolve so each call hits the quota
    }
    fetchMock.mockClear();

    const m = await getMatchBySlug(BARCA_SLUG);
    expect(m).not.toBeNull();
    expect(afCalls(fetchMock)).toHaveLength(0);
    // Falls back to seed events (5 entries from the mock).
    expect(m!.events.length).toBeGreaterThan(1);
  });

  it("does not enrich FIFA (non-Barca) matches", async () => {
    process.env.API_FOOTBALL_KEY = "test-key";
    resetEnvCache();
    resetChain();

    const fetchMock = makeFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    const m = await getMatchBySlug(FIFA_SLUG);
    expect(m).not.toBeNull();
    expect(m!.competition).toBe("fifa");
    expect(afCalls(fetchMock)).toHaveLength(0);
  });
});
