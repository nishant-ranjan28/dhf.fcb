import { describe, it, expect, vi, beforeEach } from "vitest";
import { isFacebookConfigured, postToFacebookPage } from "@/lib/facebook";

beforeEach(() => {
  vi.restoreAllMocks();
  delete process.env.FACEBOOK_PAGE_ID;
  delete process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
});

describe("isFacebookConfigured", () => {
  it("false when either var missing", () => {
    expect(isFacebookConfigured()).toBe(false);
    process.env.FACEBOOK_PAGE_ID = "123";
    expect(isFacebookConfigured()).toBe(false);
  });
  it("true when both set", () => {
    process.env.FACEBOOK_PAGE_ID = "123";
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN = "tok";
    expect(isFacebookConfigured()).toBe(true);
  });
});

describe("postToFacebookPage", () => {
  it("returns ok=false when not configured", async () => {
    const r = await postToFacebookPage({ message: "hi", link: "https://x.com" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not configured/i);
  });

  it("POSTs to /{page_id}/feed with message + link", async () => {
    process.env.FACEBOOK_PAGE_ID = "555";
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN = "tok";
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify({ id: "555_999" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const r = await postToFacebookPage({ message: "Hello", link: "https://barcapulse.com/blog/x" });
    expect(r.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/555/feed");
    const params = new URLSearchParams(String(init?.body));
    expect(params.get("message")).toBe("Hello");
    expect(params.get("link")).toBe("https://barcapulse.com/blog/x");
    expect(params.get("access_token")).toBe("tok");
  });

  it("returns ok=false on non-2xx", async () => {
    process.env.FACEBOOK_PAGE_ID = "555";
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN = "tok";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: { message: "Invalid OAuth" } }), { status: 400 }),
      ),
    );
    const r = await postToFacebookPage({ message: "Hi", link: "https://x.com" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Invalid OAuth/);
  });
});
