import { describe, it, expect, vi, beforeEach } from "vitest";
import { announce } from "@/lib/autopost/announce";
import type { BlogPost } from "@/lib/blog/types";

const POST: BlogPost = {
  slug: "yamal-deal",
  title: "Yamal commits future",
  excerpt: "x",
  body: "y",
  tags: [],
  createdAt: "2026-05-14T10:00Z",
  updatedAt: "2026-05-14T10:00Z",
  author: "BarcaPulse",
};

beforeEach(() => {
  vi.restoreAllMocks();
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHANNEL_ID;
  delete process.env.FACEBOOK_PAGE_ID;
  delete process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  delete process.env.INDEXNOW_KEY;
  delete process.env.X_API_KEY;
  delete process.env.X_API_SECRET;
  delete process.env.X_ACCESS_TOKEN;
  delete process.env.X_ACCESS_SECRET;
  delete process.env.BLUESKY_IDENTIFIER;
  delete process.env.BLUESKY_APP_PASSWORD;
  delete process.env.MASTODON_INSTANCE;
  delete process.env.MASTODON_ACCESS_TOKEN;
  delete process.env.THREADS_ACCESS_TOKEN;
  delete process.env.THREADS_USER_ID;
  delete process.env.REDDIT_CLIENT_ID;
  delete process.env.REDDIT_CLIENT_SECRET;
  delete process.env.REDDIT_USERNAME;
  delete process.env.REDDIT_PASSWORD;
  delete process.env.REDDIT_SUBREDDIT;
});

describe("announce", () => {
  it("returns 'skipped' for both when nothing is configured", async () => {
    const r = await announce(POST, "https://site.com");
    expect(r).toEqual({ telegram: "skipped", facebook: "skipped", indexnow: "skipped", x: "skipped", bluesky: "skipped", mastodon: "skipped", threads: "skipped", reddit: "skipped" });
  });

  it("returns 'ok' for both when both succeed", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "tg";
    process.env.TELEGRAM_CHANNEL_ID = "@x";
    process.env.FACEBOOK_PAGE_ID = "1";
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN = "fb";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
    const r = await announce(POST, "https://site.com");
    expect(r).toEqual({ telegram: "ok", facebook: "ok", indexnow: "skipped", x: "skipped", bluesky: "skipped", mastodon: "skipped", threads: "skipped", reddit: "skipped" });
  });

  it("returns 'err' for the failing platform without affecting the other", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "tg";
    process.env.TELEGRAM_CHANNEL_ID = "@x";
    process.env.FACEBOOK_PAGE_ID = "1";
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN = "fb";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        if (String(url).includes("graph.facebook.com")) {
          return new Response("err", { status: 500 });
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );
    const r = await announce(POST, "https://site.com");
    expect(r).toEqual({
      telegram: "ok",
      facebook: "err",
      indexnow: "skipped",
      x: "skipped",
      bluesky: "skipped",
      mastodon: "skipped",
      threads: "skipped",
      reddit: "skipped",
      errors: { facebook: expect.stringContaining("HTTP 500") },
    });
  });

  it("announces to Mastodon, Threads and Reddit when configured", async () => {
    process.env.MASTODON_INSTANCE = "mastodon.social";
    process.env.MASTODON_ACCESS_TOKEN = "mt";
    process.env.THREADS_ACCESS_TOKEN = "tt";
    process.env.THREADS_USER_ID = "u1";
    process.env.REDDIT_CLIENT_ID = "cid";
    process.env.REDDIT_CLIENT_SECRET = "sec";
    process.env.REDDIT_USERNAME = "u";
    process.env.REDDIT_PASSWORD = "p";
    process.env.REDDIT_SUBREDDIT = "Barcelona";
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("graph.threads.net") && !u.includes("threads_publish")) {
        return new Response(JSON.stringify({ id: "creation" }), { status: 200 });
      }
      if (u.includes("reddit.com/api/v1/access_token")) {
        return new Response(JSON.stringify({ access_token: "jwt" }), { status: 200 });
      }
      return new Response(JSON.stringify({ id: "1", ok: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await announce(POST, "https://site.com");
    expect(r.mastodon).toBe("ok");
    expect(r.threads).toBe("ok");
    expect(r.reddit).toBe("ok");
    expect(r.errors).toBeUndefined();
  });

  it("returns public permalinks so the article can show social cards", async () => {
    process.env.MASTODON_INSTANCE = "mastodon.social";
    process.env.MASTODON_ACCESS_TOKEN = "mt";
    const permalink = "https://mastodon.social/@BarcaPulse/123456789";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        if (String(url).includes("/api/v1/statuses")) {
          return new Response(JSON.stringify({ id: "123456789", url: permalink }), {
            status: 200,
          });
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );
    const r = await announce(POST, "https://site.com");
    expect(r.mastodon).toBe("ok");
    expect(r.postUrls).toEqual({ mastodon: permalink });
  });

  it("pings IndexNow with the post URL when configured", async () => {
    process.env.INDEXNOW_KEY = "abc123";
    const fetchMock = vi.fn(async () => new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await announce(POST, "https://site.com");
    expect(r).toEqual({ telegram: "skipped", facebook: "skipped", indexnow: "ok", x: "skipped", bluesky: "skipped", mastodon: "skipped", threads: "skipped", reddit: "skipped" });
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    const call = calls.find((c) => String(c[0]).includes("indexnow"));
    expect(call).toBeDefined();
    const body = JSON.parse(String(call![1].body));
    expect(body.urlList).toEqual(["https://site.com/blog/yamal-deal"]);
  });
});
