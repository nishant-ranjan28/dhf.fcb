import { describe, it, expect, vi, beforeEach } from "vitest";
import { isXConfigured, postToX, formatTweet } from "@/lib/x";

beforeEach(() => {
  vi.restoreAllMocks();
  delete process.env.X_API_KEY;
  delete process.env.X_API_SECRET;
  delete process.env.X_ACCESS_TOKEN;
  delete process.env.X_ACCESS_SECRET;
});

function configure() {
  process.env.X_API_KEY = "ck";
  process.env.X_API_SECRET = "cs";
  process.env.X_ACCESS_TOKEN = "at";
  process.env.X_ACCESS_SECRET = "as";
}

describe("isXConfigured", () => {
  it("false unless all four vars set", () => {
    expect(isXConfigured()).toBe(false);
    process.env.X_API_KEY = "ck";
    process.env.X_API_SECRET = "cs";
    process.env.X_ACCESS_TOKEN = "at";
    expect(isXConfigured()).toBe(false);
    process.env.X_ACCESS_SECRET = "as";
    expect(isXConfigured()).toBe(true);
  });
});

describe("formatTweet", () => {
  it("joins title and url", () => {
    expect(formatTweet("Hello", "https://s.com/blog/x")).toBe("Hello\n\nhttps://s.com/blog/x");
  });
  it("truncates long titles so text fits 280 with t.co url length", () => {
    const title = "a".repeat(400);
    const out = formatTweet(title, "https://s.com/blog/x");
    // 280 budget - 23 (t.co) - 2 (newlines) = 255 chars for the title
    const bodyPart = out.split("\n\n")[0];
    expect(bodyPart.length).toBeLessThanOrEqual(255);
    expect(bodyPart.endsWith("…")).toBe(true);
    expect(out.endsWith("https://s.com/blog/x")).toBe(true);
  });
});

describe("postToX", () => {
  it("returns ok=false when not configured", async () => {
    const r = await postToX({ text: "hi" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not configured/i);
  });

  it("POSTs JSON to /2/tweets with an OAuth1 authorization header", async () => {
    configure();
    const fetchMock = vi.fn(async () => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await postToX({ text: "hello world" });
    expect(r.ok).toBe(true);
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    const [url, init] = calls[0];
    expect(url).toBe("https://api.x.com/2/tweets");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ text: "hello world" });
    const auth = String((init.headers as Record<string, string>).authorization);
    expect(auth).toMatch(/^OAuth /);
    expect(auth).toContain('oauth_consumer_key="ck"');
    expect(auth).toContain('oauth_token="at"');
    expect(auth).toContain('oauth_signature_method="HMAC-SHA1"');
    expect(auth).toMatch(/oauth_signature="[^"]+"/);
  });

  it("returns ok=false with status on HTTP error", async () => {
    configure();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("dup", { status: 403 })));
    const r = await postToX({ text: "hi" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/403/);
  });

  it("returns ok=false on network error, never throws", async () => {
    configure();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("boom"))));
    const r = await postToX({ text: "hi" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/boom/);
  });
});
