import { describe, it, expect, beforeEach, vi } from "vitest";
import { runPipeline } from "@/lib/autopost/pipeline";
import { _resetBlogStore, blogStore } from "@/lib/blog/store";
import { _resetAutopostState, autopostState } from "@/lib/autopost/state";
import { resetEnvCache } from "@/lib/env";
import type { NewsPost } from "@/lib/types";

function newsItem(over: Partial<NewsPost> = {}): NewsPost {
  return {
    id: "1",
    slug: "bbc-sport-barcelona-yamal-deal",
    title: "Yamal signs Barcelona deal",
    content: "Lamine Yamal signed today.",
    category: "barca",
    createdAt: "2026-05-14T10:00:00Z",
    lang: "en",
    link: "https://bbc.co.uk/x",
    ...over,
  };
}

const GOOD_DRAFT = {
  title: "Yamal commits future to Barcelona",
  body: "Lamine Yamal has signed a new contract with Barcelona. " + "word ".repeat(700),
  excerpt: "Yamal extends his Barcelona contract.",
  tags: ["barcelona", "yamal"],
  provider: "groq" as const,
};

beforeEach(async () => {
  _resetBlogStore();
  _resetAutopostState();
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.AUTOPOST_ENABLED;
  resetEnvCache();
  // Default to enabled for the bulk of tests; the "disabled" test below
  // leaves AUTOPOST_ENABLED unset (the production default — opt-in).
  process.env.AUTOPOST_ENABLED = "true";
  resetEnvCache();
  await blogStore()._reset?.();
  await autopostState()._reset?.();
  vi.restoreAllMocks();
});

describe("runPipeline", () => {
  it("returns disabled when AUTOPOST_ENABLED is not 'true'", async () => {
    delete process.env.AUTOPOST_ENABLED;
    resetEnvCache();
    const r = await runPipeline({
      fetchNews: async () => [],
      generate: async () => ({ ok: true, draft: GOOD_DRAFT }),
      announceFn: async () => ({ telegram: "skipped", facebook: "skipped", indexnow: "skipped", x: "skipped", bluesky: "skipped", mastodon: "skipped", threads: "skipped", reddit: "skipped" }),
      siteUrl: "https://x.com",
    });
    expect(r).toEqual({ status: "skipped", reason: "disabled" });
  });

  it("skips with no_eligible_news when feed is empty", async () => {
    const r = await runPipeline({
      fetchNews: async () => [],
      generate: async () => ({ ok: true, draft: GOOD_DRAFT }),
      announceFn: async () => ({ telegram: "skipped", facebook: "skipped", indexnow: "skipped", x: "skipped", bluesky: "skipped", mastodon: "skipped", threads: "skipped", reddit: "skipped" }),
      siteUrl: "https://x.com",
    });
    expect(r).toEqual({ status: "skipped", reason: "no_eligible_news" });
  });

  it("publishes a passing draft and records the publish", async () => {
    const r = await runPipeline({
      fetchNews: async () => [newsItem()],
      generate: async () => ({ ok: true, draft: GOOD_DRAFT }),
      announceFn: async () => ({ telegram: "ok", facebook: "ok", indexnow: "skipped", x: "skipped", bluesky: "skipped", mastodon: "skipped", threads: "skipped", reddit: "skipped" }),
      siteUrl: "https://x.com",
    });
    expect(r.status).toBe("published");
    if (r.status === "published") {
      expect(r.slug).toBe("yamal-commits-future-to-barcelona");
      expect(r.announces).toEqual({ telegram: "ok", facebook: "ok", indexnow: "skipped", x: "skipped", bluesky: "skipped", mastodon: "skipped", threads: "skipped", reddit: "skipped" });
    }
    expect(await autopostState().publishedToday()).toBe(1);
  });

  it("populates coverImage from the source article's og:image when available", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("bbc.co.uk")) {
        return new Response(
          `<meta property="og:image" content="https://cdn.bbc.co.uk/hero.jpg">`,
          { status: 200, headers: { "content-type": "text/html" } },
        );
      }
      return new Response("not mocked", { status: 599 });
    }));
    const r = await runPipeline({
      fetchNews: async () => [newsItem({ link: "https://bbc.co.uk/article" })],
      generate: async () => ({ ok: true, draft: GOOD_DRAFT }),
      announceFn: async () => ({ telegram: "skipped", facebook: "skipped", indexnow: "skipped", x: "skipped", bluesky: "skipped", mastodon: "skipped", threads: "skipped", reddit: "skipped" }),
      siteUrl: "https://x.com",
    });
    expect(r.status).toBe("published");
    const saved = await blogStore().get((r as { status: "published"; slug: string }).slug);
    expect(saved?.coverImage).toBe("https://cdn.bbc.co.uk/hero.jpg");
  });

  it("stores announcement permalinks as social posts on the published article", async () => {
    const postUrl = "https://mastodon.social/@BarcaPulse/123456789";
    const r = await runPipeline({
      fetchNews: async () => [newsItem()],
      generate: async () => ({ ok: true, draft: GOOD_DRAFT }),
      announceFn: async () => ({
        telegram: "ok",
        facebook: "skipped",
        indexnow: "skipped",
        x: "skipped",
        bluesky: "skipped",
        mastodon: "ok",
        threads: "skipped",
        reddit: "skipped",
        postUrls: { mastodon: postUrl },
      }),
      siteUrl: "https://x.com",
    });
    expect(r.status).toBe("published");
    const saved = await blogStore().get((r as { status: "published"; slug: string }).slug);
    expect(saved?.socialPosts).toEqual([{ platform: "mastodon", url: postUrl }]);
  });

  it("skips when word count gate fails", async () => {
    const r = await runPipeline({
      fetchNews: async () => [newsItem()],
      generate: async () =>
        ({ ok: true, draft: { ...GOOD_DRAFT, body: "too short" } }),
      announceFn: async () => ({ telegram: "skipped", facebook: "skipped", indexnow: "skipped", x: "skipped", bluesky: "skipped", mastodon: "skipped", threads: "skipped", reddit: "skipped" }),
      siteUrl: "https://x.com",
    });
    expect(r.status).toBe("skipped");
    if (r.status === "skipped") {
      expect(r.reason).toBe("gate_word_count");
      expect(typeof r.diagnostics?.wordCount).toBe("number");
    }
    expect(await autopostState().publishedToday()).toBe(0);
  });

  it("skips when day cap is already reached", async () => {
    const s = autopostState();
    for (let i = 0; i < 24; i++) await s.recordPublish({ provider: "groq" });
    const r = await runPipeline({
      fetchNews: async () => [newsItem()],
      generate: async () => ({ ok: true, draft: GOOD_DRAFT }),
      announceFn: async () => ({ telegram: "skipped", facebook: "skipped", indexnow: "skipped", x: "skipped", bluesky: "skipped", mastodon: "skipped", threads: "skipped", reddit: "skipped" }),
      siteUrl: "https://x.com",
    });
    expect(r).toEqual({ status: "skipped", reason: "day_cap_reached" });
  });

  it("skips with manual_cooldown when newest blog post is younger than 55min", async () => {
    await blogStore().create({ title: "Manual post", body: "x" });
    const r = await runPipeline({
      fetchNews: async () => [newsItem()],
      generate: async () => ({ ok: true, draft: GOOD_DRAFT }),
      announceFn: async () => ({ telegram: "skipped", facebook: "skipped", indexnow: "skipped", x: "skipped", bluesky: "skipped", mastodon: "skipped", threads: "skipped", reddit: "skipped" }),
      siteUrl: "https://x.com",
    });
    expect(r).toEqual({ status: "skipped", reason: "manual_cooldown" });
  });

  it("skips with min_interval when newest post is a recent autopost", async () => {
    await blogStore().create({ title: "Prior autopost", body: "x", author: "BarcaPulse Auto" });
    const r = await runPipeline({
      fetchNews: async () => [newsItem()],
      generate: async () => ({ ok: true, draft: GOOD_DRAFT }),
      announceFn: async () => ({ telegram: "skipped", facebook: "skipped", indexnow: "skipped", x: "skipped", bluesky: "skipped", mastodon: "skipped", threads: "skipped", reddit: "skipped" }),
      siteUrl: "https://x.com",
    });
    expect(r).toEqual({ status: "skipped", reason: "min_interval" });
  });

  it("publishes when the newest autopost is older than the 10min interval", async () => {
    vi.useFakeTimers({ now: Date.now() - 20 * 60 * 1000 });
    try {
      await blogStore().create({ title: "Prior autopost", body: "x", author: "BarcaPulse Auto" });
    } finally {
      vi.useRealTimers();
    }
    const r = await runPipeline({
      fetchNews: async () => [newsItem()],
      generate: async () => ({ ok: true, draft: GOOD_DRAFT }),
      announceFn: async () => ({ telegram: "skipped", facebook: "skipped", indexnow: "skipped", x: "skipped", bluesky: "skipped", mastodon: "skipped", threads: "skipped", reddit: "skipped" }),
      siteUrl: "https://x.com",
    });
    expect(r.status).toBe("published");
  });

  it("retries generation once when a headline entity is missing", async () => {
    const bad = {
      ...GOOD_DRAFT,
      title: "Yamal deal covered",
      body: "Barcelona announced a new deal today. " + "word ".repeat(700),
    };
    const good = {
      ...GOOD_DRAFT,
      title: "Yamal deal covered",
      body: "Lamine Yamal signed a new deal with Barcelona today. " + "word ".repeat(700),
    };
    const generate = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, draft: bad })
      .mockResolvedValueOnce({ ok: true, draft: good });
    const r = await runPipeline({
      fetchNews: async () => [newsItem()],
      generate,
      announceFn: async () => ({ telegram: "skipped", facebook: "skipped", indexnow: "skipped", x: "skipped", bluesky: "skipped", mastodon: "skipped", threads: "skipped", reddit: "skipped" }),
      siteUrl: "https://x.com",
    });
    expect(r, JSON.stringify(r)).toMatchObject({ status: "published" });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][1]).toEqual({ missingEntities: ["yamal"] });
  });

  it("still publishes when entity coverage fails even after the repair", async () => {
    const bad = {
      ...GOOD_DRAFT,
      title: "Yamal deal covered",
      body: "Barcelona announced a new deal today. " + "word ".repeat(700),
    };
    const generate = vi.fn().mockResolvedValue({ ok: true, draft: bad });
    const r = await runPipeline({
      fetchNews: async () => [newsItem()],
      generate,
      announceFn: async () => ({ telegram: "skipped", facebook: "skipped", indexnow: "skipped", x: "skipped", bluesky: "skipped", mastodon: "skipped", threads: "skipped", reddit: "skipped" }),
      siteUrl: "https://x.com",
    });
    expect(r, JSON.stringify(r)).toMatchObject({ status: "published" });
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("propagates provider failure as all_providers_failed", async () => {
    const r = await runPipeline({
      fetchNews: async () => [newsItem()],
      generate: async () => ({ ok: false, reason: "all_providers_failed" }),
      announceFn: async () => ({ telegram: "skipped", facebook: "skipped", indexnow: "skipped", x: "skipped", bluesky: "skipped", mastodon: "skipped", threads: "skipped", reddit: "skipped" }),
      siteUrl: "https://x.com",
    });
    expect(r).toEqual({ status: "skipped", reason: "all_providers_failed" });
  });
});
