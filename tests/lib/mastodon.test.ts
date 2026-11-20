import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  formatMastodonStatus,
  isMastodonConfigured,
  postToMastodon,
} from "@/lib/mastodon";

beforeEach(() => {
  vi.restoreAllMocks();
  delete process.env.MASTODON_INSTANCE;
  delete process.env.MASTODON_ACCESS_TOKEN;
});

function configure() {
  process.env.MASTODON_INSTANCE = "https://mastodon.social/";
  process.env.MASTODON_ACCESS_TOKEN = "token123";
}

describe("isMastodonConfigured", () => {
  it("false unless both vars set", () => {
    expect(isMastodonConfigured()).toBe(false);
    process.env.MASTODON_INSTANCE = "mastodon.social";
    expect(isMastodonConfigured()).toBe(false);
    process.env.MASTODON_ACCESS_TOKEN = "t";
    expect(isMastodonConfigured()).toBe(true);
  });
});

describe("formatMastodonStatus", () => {
  it("keeps the full URL and truncates long titles", () => {
    const url = "https://site.com/blog/yamal";
    const text = formatMastodonStatus("a".repeat(600), url, 100);
    expect(text.length).toBeLessThanOrEqual(100);
    expect(text.endsWith(url)).toBe(true);
    expect(text).toContain("…");
  });
});

describe("postToMastodon", () => {
  it("returns ok=false when not configured", async () => {
    const r = await postToMastodon({ title: "hi", url: "https://s.com/x" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not configured/i);
  });

  it("posts a public status and returns the id", async () => {
    configure();
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: "12345" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const r = await postToMastodon({ title: "Yamal signs", url: "https://s.com/blog/yamal" });
    expect(r).toEqual({ ok: true, id: "12345" });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://mastodon.social/api/v2/statuses");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer token123");
    expect(JSON.parse(String(init.body))).toEqual({
      status: "Yamal signs\n\nhttps://s.com/blog/yamal",
      visibility: "public",
      language: "en",
    });
  });

  it("returns ok=false on API error", async () => {
    configure();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 401 })));
    const r = await postToMastodon({ title: "hi", url: "https://s.com/x" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/401/);
  });

  it("returns ok=false on network error, never throws", async () => {
    configure();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("down"))));
    const r = await postToMastodon({ title: "hi", url: "https://s.com/x" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/down/);
  });
});
