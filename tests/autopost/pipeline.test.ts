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
  provider: "gemini" as const,
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
      announceFn: async () => ({ telegram: "skipped", facebook: "skipped" }),
      siteUrl: "https://x.com",
    });
    expect(r).toEqual({ status: "skipped", reason: "disabled" });
  });

  it("skips with no_eligible_news when feed is empty", async () => {
    const r = await runPipeline({
      fetchNews: async () => [],
      generate: async () => ({ ok: true, draft: GOOD_DRAFT }),
      announceFn: async () => ({ telegram: "skipped", facebook: "skipped" }),
      siteUrl: "https://x.com",
    });
    expect(r).toEqual({ status: "skipped", reason: "no_eligible_news" });
  });

  it("publishes a passing draft and records the publish", async () => {
    const r = await runPipeline({
      fetchNews: async () => [newsItem()],
      generate: async () => ({ ok: true, draft: GOOD_DRAFT }),
      announceFn: async () => ({ telegram: "ok", facebook: "ok" }),
      siteUrl: "https://x.com",
    });
    expect(r.status).toBe("published");
    if (r.status === "published") {
      expect(r.slug).toBe("yamal-commits-future-to-barcelona");
      expect(r.announces).toEqual({ telegram: "ok", facebook: "ok" });
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
      announceFn: async () => ({ telegram: "skipped", facebook: "skipped" }),
      siteUrl: "https://x.com",
    });
    expect(r.status).toBe("published");
    const saved = await blogStore().get((r as { status: "published"; slug: string }).slug);
    expect(saved?.coverImage).toBe("https://cdn.bbc.co.uk/hero.jpg");
  });

  it("skips when word count gate fails", async () => {
    const r = await runPipeline({
      fetchNews: async () => [newsItem()],
      generate: async () =>
        ({ ok: true, draft: { ...GOOD_DRAFT, body: "too short" } }),
      announceFn: async () => ({ telegram: "skipped", facebook: "skipped" }),
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
    for (let i = 0; i < 24; i++) await s.recordPublish({ provider: "gemini" });
    const r = await runPipeline({
      fetchNews: async () => [newsItem()],
      generate: async () => ({ ok: true, draft: GOOD_DRAFT }),
      announceFn: async () => ({ telegram: "skipped", facebook: "skipped" }),
      siteUrl: "https://x.com",
    });
    expect(r).toEqual({ status: "skipped", reason: "day_cap_reached" });
  });

  it("skips with manual_cooldown when newest blog post is younger than 55min", async () => {
    await blogStore().create({ title: "Manual post", body: "x" });
    const r = await runPipeline({
      fetchNews: async () => [newsItem()],
      generate: async () => ({ ok: true, draft: GOOD_DRAFT }),
      announceFn: async () => ({ telegram: "skipped", facebook: "skipped" }),
      siteUrl: "https://x.com",
    });
    expect(r).toEqual({ status: "skipped", reason: "manual_cooldown" });
  });

  it("does NOT cool down when newest post is from autopost itself", async () => {
    await blogStore().create({ title: "Prior autopost", body: "x", author: "BarcaPulse Auto" });
    const r = await runPipeline({
      fetchNews: async () => [newsItem()],
      generate: async () => ({ ok: true, draft: GOOD_DRAFT }),
      announceFn: async () => ({ telegram: "skipped", facebook: "skipped" }),
      siteUrl: "https://x.com",
    });
    expect(r.status).toBe("published");
  });

  it("propagates provider failure as all_providers_failed", async () => {
    const r = await runPipeline({
      fetchNews: async () => [newsItem()],
      generate: async () => ({ ok: false, reason: "all_providers_failed" }),
      announceFn: async () => ({ telegram: "skipped", facebook: "skipped" }),
      siteUrl: "https://x.com",
    });
    expect(r).toEqual({ status: "skipped", reason: "all_providers_failed" });
  });
});
