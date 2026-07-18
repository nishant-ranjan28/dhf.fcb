import { describe, it, expect, vi, beforeEach } from "vitest";
import { isIndexNowConfigured, submitToIndexNow } from "@/lib/indexnow";

beforeEach(() => {
  vi.restoreAllMocks();
  delete process.env.INDEXNOW_KEY;
});

describe("isIndexNowConfigured", () => {
  it("false when INDEXNOW_KEY missing or blank", () => {
    expect(isIndexNowConfigured()).toBe(false);
    process.env.INDEXNOW_KEY = "  ";
    expect(isIndexNowConfigured()).toBe(false);
  });
  it("true when set", () => {
    process.env.INDEXNOW_KEY = "abc123";
    expect(isIndexNowConfigured()).toBe(true);
  });
});

describe("submitToIndexNow", () => {
  it("returns ok=false when not configured", async () => {
    const r = await submitToIndexNow(["https://site.com/blog/x"], "https://site.com");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not configured/i);
  });

  it("no-ops on empty url list", async () => {
    process.env.INDEXNOW_KEY = "abc123";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const r = await submitToIndexNow([], "https://site.com");
    expect(r.ok).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs host, key, keyLocation and urlList as JSON", async () => {
    process.env.INDEXNOW_KEY = "abc123";
    const fetchMock = vi.fn(async () => new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await submitToIndexNow(["https://site.com/blog/x"], "https://site.com");
    expect(r.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.indexnow.org/indexnow");
    const body = JSON.parse(String(init.body));
    expect(body).toEqual({
      host: "site.com",
      key: "abc123",
      keyLocation: "https://site.com/indexnow.txt",
      urlList: ["https://site.com/blog/x"],
    });
  });

  it("returns ok=false with status on HTTP error", async () => {
    process.env.INDEXNOW_KEY = "abc123";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad key", { status: 403 })));
    const r = await submitToIndexNow(["https://site.com/blog/x"], "https://site.com");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/403/);
  });

  it("returns ok=false on network error, never throws", async () => {
    process.env.INDEXNOW_KEY = "abc123";
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("boom"))));
    const r = await submitToIndexNow(["https://site.com/blog/x"], "https://site.com");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/boom/);
  });
});
