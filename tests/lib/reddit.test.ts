import { describe, it, expect, vi, beforeEach } from "vitest";
import { isRedditConfigured, postToReddit } from "@/lib/reddit";

beforeEach(() => {
  vi.restoreAllMocks();
  delete process.env.REDDIT_CLIENT_ID;
  delete process.env.REDDIT_CLIENT_SECRET;
  delete process.env.REDDIT_USERNAME;
  delete process.env.REDDIT_PASSWORD;
  delete process.env.REDDIT_SUBREDDIT;
});

function configure() {
  process.env.REDDIT_CLIENT_ID = "client";
  process.env.REDDIT_CLIENT_SECRET = "secret";
  process.env.REDDIT_USERNAME = "barcapulse";
  process.env.REDDIT_PASSWORD = "pass";
  process.env.REDDIT_SUBREDDIT = "/r/Barcelona";
}

function mockApi() {
  return vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes("/api/v1/access_token")) {
      return new Response(JSON.stringify({ access_token: "jwt" }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });
}

describe("isRedditConfigured", () => {
  it("requires all five vars", () => {
    expect(isRedditConfigured()).toBe(false);
    configure();
    expect(isRedditConfigured()).toBe(true);
  });
});

describe("postToReddit", () => {
  it("returns ok=false when not configured", async () => {
    const r = await postToReddit({ title: "hi", url: "https://s.com/x" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not configured/i);
  });

  it("authenticates then submits a link post", async () => {
    configure();
    const mock = mockApi();
    vi.stubGlobal("fetch", mock);
    const r = await postToReddit({ title: "Yamal signs", url: "https://s.com/blog/yamal" });
    expect(r.ok).toBe(true);

    const calls = mock.mock.calls as unknown as [string, RequestInit][];
    expect(String(calls[0][0])).toBe("https://www.reddit.com/api/v1/access_token");
    const authHeaders = calls[0][1].headers as Record<string, string>;
    expect(authHeaders.authorization).toBe(`Basic ${Buffer.from("client:secret").toString("base64")}`);
    expect(authHeaders["user-agent"]).toContain("/u/barcapulse");

    expect(String(calls[1][0])).toBe("https://oauth.reddit.com/api/v1/links");
    const submitHeaders = calls[1][1].headers as Record<string, string>;
    expect(submitHeaders.authorization).toBe("Bearer jwt");
    const body = new URLSearchParams(String(calls[1][1].body));
    expect(body.get("sr")).toBe("Barcelona");
    expect(body.get("kind")).toBe("link");
    expect(body.get("title")).toBe("Yamal signs");
    expect(body.get("url")).toBe("https://s.com/blog/yamal");
  });

  it("surfaces Reddit json.errors as a failure", async () => {
    configure();
    const mock = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("access_token")) {
        return new Response(JSON.stringify({ access_token: "jwt" }), { status: 200 });
      }
      return new Response(JSON.stringify({ json: { errors: [["BAD_SR", "subreddit forbidden"]] } }), {
        status: 200,
      });
    });
    vi.stubGlobal("fetch", mock);
    const r = await postToReddit({ title: "hi", url: "https://s.com/x" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("subreddit forbidden");
  });

  it("returns ok=false when auth fails", async () => {
    configure();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 401 })));
    const r = await postToReddit({ title: "hi", url: "https://s.com/x" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/401/);
  });
});
