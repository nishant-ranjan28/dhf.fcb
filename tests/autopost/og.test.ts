import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchOgImage } from "@/lib/autopost/og";

function htmlResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html" },
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("fetchOgImage", () => {
  it("extracts og:image when property comes first", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      htmlResponse(`<html><head><meta property="og:image" content="https://cdn.bbc.co.uk/img.jpg"></head></html>`)
    ));
    const url = await fetchOgImage("https://bbc.co.uk/sport/x");
    expect(url).toBe("https://cdn.bbc.co.uk/img.jpg");
  });

  it("extracts og:image when content comes first", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      htmlResponse(`<meta content="https://x.com/p.jpg" property="og:image">`)
    ));
    expect(await fetchOgImage("https://x.com/article")).toBe("https://x.com/p.jpg");
  });

  it("falls back to twitter:image when og:image absent", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      htmlResponse(`<meta name="twitter:image" content="https://x.com/tw.jpg">`)
    ));
    expect(await fetchOgImage("https://x.com/article")).toBe("https://x.com/tw.jpg");
  });

  it("resolves relative URLs against the article URL", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      htmlResponse(`<meta property="og:image" content="/static/hero.jpg">`)
    ));
    expect(await fetchOgImage("https://bbc.co.uk/sport/article")).toBe(
      "https://bbc.co.uk/static/hero.jpg"
    );
  });

  it("returns null when no meta tag is present", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => htmlResponse(`<html><body>no head meta</body></html>`)));
    expect(await fetchOgImage("https://x.com/a")).toBeNull();
  });

  it("returns null on non-2xx", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404 })));
    expect(await fetchOgImage("https://x.com/a")).toBeNull();
  });

  it("returns null on network error without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ENETUNREACH"); }));
    expect(await fetchOgImage("https://x.com/a")).toBeNull();
  });
});
