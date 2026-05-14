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
});

describe("announce", () => {
  it("returns 'skipped' for both when nothing is configured", async () => {
    const r = await announce(POST, "https://site.com");
    expect(r).toEqual({ telegram: "skipped", facebook: "skipped" });
  });

  it("returns 'ok' for both when both succeed", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "tg";
    process.env.TELEGRAM_CHANNEL_ID = "@x";
    process.env.FACEBOOK_PAGE_ID = "1";
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN = "fb";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
    const r = await announce(POST, "https://site.com");
    expect(r).toEqual({ telegram: "ok", facebook: "ok" });
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
    expect(r).toEqual({ telegram: "ok", facebook: "err" });
  });
});
