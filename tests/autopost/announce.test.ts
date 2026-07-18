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
});

describe("announce", () => {
  it("returns 'skipped' for both when nothing is configured", async () => {
    const r = await announce(POST, "https://site.com");
    expect(r).toEqual({ telegram: "skipped", facebook: "skipped", indexnow: "skipped", x: "skipped", bluesky: "skipped" });
  });

  it("returns 'ok' for both when both succeed", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "tg";
    process.env.TELEGRAM_CHANNEL_ID = "@x";
    process.env.FACEBOOK_PAGE_ID = "1";
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN = "fb";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
    const r = await announce(POST, "https://site.com");
    expect(r).toEqual({ telegram: "ok", facebook: "ok", indexnow: "skipped", x: "skipped", bluesky: "skipped" });
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
    expect(r).toEqual({ telegram: "ok", facebook: "err", indexnow: "skipped", x: "skipped", bluesky: "skipped" });
  });

  it("pings IndexNow with the post URL when configured", async () => {
    process.env.INDEXNOW_KEY = "abc123";
    const fetchMock = vi.fn(async () => new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await announce(POST, "https://site.com");
    expect(r).toEqual({ telegram: "skipped", facebook: "skipped", indexnow: "ok", x: "skipped", bluesky: "skipped" });
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    const call = calls.find((c) => String(c[0]).includes("indexnow"));
    expect(call).toBeDefined();
    const body = JSON.parse(String(call![1].body));
    expect(body.urlList).toEqual(["https://site.com/blog/yamal-deal"]);
  });
});
