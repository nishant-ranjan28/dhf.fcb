import { describe, it, expect, beforeEach } from "vitest";
import { runRecapPipeline } from "@/lib/recap/pipeline";
import { _resetRecapState, recapState } from "@/lib/recap/state";
import { _resetBlogStore, blogStore } from "@/lib/blog/store";
import { resetEnvCache } from "@/lib/env";
import type { Match } from "@/lib/types";
import type { RecapResult } from "@/lib/recap/generate";

function ftMatch(slug: string): Match {
  return {
    slug,
    competition: "fifa",
    competitionName: "World Cup",
    home: { name: "Mexico", short: "MEX" },
    away: { name: "South Africa", short: "RSA" },
    scoreHome: 2,
    scoreAway: 1,
    status: "FT",
    minute: 90,
    kickoff: new Date(Date.now() - 2 * 3600_000).toISOString(),
    events: [{ minute: 20, type: "goal", team: "home", player: "Giménez" }],
    stats: {
      possession: { home: 55, away: 45 },
      shots: { home: 10, away: 6 },
      shotsOnTarget: { home: 4, away: 2 },
      corners: { home: 4, away: 3 },
      fouls: { home: 0, away: 0 },
    },
    lineupHome: { formation: "", starting: [] },
    lineupAway: { formation: "", starting: [] },
  };
}

const goodDraft: RecapResult = {
  ok: true,
  draft: {
    title: "Mexico see off South Africa",
    // 150 words — comfortably over the recap floor of 120.
    body: Array.from({ length: 150 }, (_, i) => `word${i}`).join(" "),
    excerpt: "Mexico win their opener.",
    tags: ["world-cup", "mexico"],
    provider: "groq",
  },
};

function deps(over: Partial<Parameters<typeof runRecapPipeline>[0]> = {}) {
  return {
    getMatches: async () => [ftMatch("mexico-vs-south-africa")],
    generate: async () => goodDraft,
    announceFn: async () => ({ telegram: "ok" as const, facebook: "skipped" as const }),
    siteUrl: "https://example.com",
    now: Date.now(),
    ...over,
  };
}

beforeEach(async () => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  process.env.RECAP_ENABLED = "true";
  resetEnvCache();
  _resetRecapState();
  _resetBlogStore();
  await recapState()._reset?.();
  await blogStore()._reset?.();
});

describe("runRecapPipeline", () => {
  it("publishes a recap, marks it done and announces", async () => {
    const res = await runRecapPipeline(deps());
    expect(res.status).toBe("published");
    if (res.status === "published") {
      expect(res.announces.telegram).toBe("ok");
      expect(await recapState().isRecapped("mexico-vs-south-africa")).toBe(true);
    }
    // The post is now in the blog store.
    const posts = await blogStore().list({ limit: 5 });
    expect(posts.some((p) => p.title === "Mexico see off South Africa")).toBe(true);
    expect(posts[0].author).toBe("BarcaPulse Recap");
  });

  it("is disabled when RECAP_ENABLED is not set", async () => {
    process.env.RECAP_ENABLED = "false";
    resetEnvCache();
    const res = await runRecapPipeline(deps());
    expect(res).toMatchObject({ status: "skipped", reason: "disabled" });
  });

  it("skips when there is no eligible match", async () => {
    const res = await runRecapPipeline(deps({ getMatches: async () => [] }));
    expect(res).toMatchObject({ status: "skipped", reason: "no_eligible_match" });
  });

  it("does not recap the same match twice", async () => {
    await runRecapPipeline(deps());
    const second = await runRecapPipeline(deps());
    expect(second).toMatchObject({ status: "skipped", reason: "no_eligible_match" });
  });

  it("skips when generation fails", async () => {
    const res = await runRecapPipeline(
      deps({ generate: async () => ({ ok: false, reason: "all_providers_failed" }) }),
    );
    expect(res).toMatchObject({ status: "skipped", reason: "all_providers_failed" });
  });

  it("rejects a too-short recap on the word-count gate", async () => {
    const res = await runRecapPipeline(
      deps({
        generate: async () => ({
          ok: true,
          draft: { ...goodDraft.draft, body: "too short" },
        }),
      }),
    );
    expect(res).toMatchObject({ status: "skipped", reason: "gate_word_count" });
  });
});
