import { describe, it, expect, vi, beforeEach } from "vitest";
import { isBlueskyConfigured, postToBluesky } from "@/lib/bluesky";

beforeEach(() => {
  vi.restoreAllMocks();
  delete process.env.BLUESKY_IDENTIFIER;
  delete process.env.BLUESKY_APP_PASSWORD;
});

function configure() {
  process.env.BLUESKY_IDENTIFIER = "barcapulse.bsky.social";
  process.env.BLUESKY_APP_PASSWORD = "app-pass";
}

function sessionResponse() {
  return new Response(
    JSON.stringify({ accessJwt: "jwt123", did: "did:plc:abc" }),
    { status: 200 },
  );
}

describe("isBlueskyConfigured", () => {
  it("false unless both vars set", () => {
    expect(isBlueskyConfigured()).toBe(false);
    process.env.BLUESKY_IDENTIFIER = "x";
    expect(isBlueskyConfigured()).toBe(false);
    process.env.BLUESKY_APP_PASSWORD = "y";
    expect(isBlueskyConfigured()).toBe(true);
  });
});

describe("postToBluesky", () => {
  it("returns ok=false when not configured", async () => {
    const r = await postToBluesky({ title: "hi", url: "https://s.com/x" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not configured/i);
  });

  it("creates a session then a post record with a link facet", async () => {
    configure();
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("createSession")) return sessionResponse();
      return new Response(JSON.stringify({ uri: "at://..." }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await postToBluesky({ title: "Yamal signs", url: "https://s.com/blog/yamal" });
    expect(r.ok).toBe(true);

    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    const [sessUrl, sessInit] = calls[0];
    expect(String(sessUrl)).toBe("https://bsky.social/xrpc/com.atproto.server.createSession");
    expect(JSON.parse(String(sessInit.body))).toEqual({
      identifier: "barcapulse.bsky.social",
      password: "app-pass",
    });

    const [recUrl, recInit] = calls[1];
    expect(String(recUrl)).toBe("https://bsky.social/xrpc/com.atproto.repo.createRecord");
    expect((recInit.headers as Record<string, string>).authorization).toBe("Bearer jwt123");
    const body = JSON.parse(String(recInit.body));
    expect(body.repo).toBe("did:plc:abc");
    expect(body.collection).toBe("app.bsky.feed.post");
    expect(body.record.text).toBe("Yamal signs\n\nhttps://s.com/blog/yamal");
    expect(body.record.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const facet = body.record.facets[0];
    // byte offsets of the url within the text
    expect(facet.index).toEqual({ byteStart: 13, byteEnd: 37 });
    expect(facet.features[0]).toEqual({
      $type: "app.bsky.richtext.facet#link",
      uri: "https://s.com/blog/yamal",
    });
    // link card without an image: external embed, no thumb
    expect(body.record.embed).toEqual({
      $type: "app.bsky.embed.external",
      external: {
        uri: "https://s.com/blog/yamal",
        title: "Yamal signs",
        description: "",
      },
    });
  });

  it("uploads the cover image and attaches it as the card thumb", async () => {
    configure();
    const blobRef = { $type: "blob", ref: { $link: "bafk123" }, mimeType: "image/jpeg", size: 3 };
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("createSession")) return sessionResponse();
      if (u === "https://cdn.example.com/cover.jpg")
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        });
      if (u.includes("uploadBlob"))
        return new Response(JSON.stringify({ blob: blobRef }), { status: 200 });
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await postToBluesky({
      title: "Yamal signs",
      url: "https://s.com/blog/yamal",
      description: "Contract until 2030.",
      imageUrl: "https://cdn.example.com/cover.jpg",
    });
    expect(r.ok).toBe(true);

    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    const upload = calls.find((c) => String(c[0]).includes("uploadBlob"));
    expect(upload).toBeDefined();
    const upInit = upload![1];
    expect((upInit.headers as Record<string, string>).authorization).toBe("Bearer jwt123");
    expect((upInit.headers as Record<string, string>)["content-type"]).toBe("image/jpeg");

    const rec = calls.find((c) => String(c[0]).includes("createRecord"));
    const body = JSON.parse(String(rec![1].body));
    expect(body.record.embed.external.thumb).toEqual(blobRef);
    expect(body.record.embed.external.description).toBe("Contract until 2030.");
  });

  it("still posts the card without a thumb when the image fetch fails", async () => {
    configure();
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("createSession")) return sessionResponse();
      if (u.includes("cover.jpg")) return new Response("", { status: 404 });
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await postToBluesky({
      title: "hi",
      url: "https://s.com/x",
      imageUrl: "https://cdn.example.com/cover.jpg",
    });
    expect(r.ok).toBe(true);
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect(calls.some((c) => String(c[0]).includes("uploadBlob"))).toBe(false);
    const rec = calls.find((c) => String(c[0]).includes("createRecord"));
    const body = JSON.parse(String(rec![1].body));
    expect(body.record.embed.external.thumb).toBeUndefined();
  });

  it("returns ok=false when session creation fails", async () => {
    configure();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 401 })));
    const r = await postToBluesky({ title: "hi", url: "https://s.com/x" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/401/);
  });

  it("returns ok=false on network error, never throws", async () => {
    configure();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("down"))));
    const r = await postToBluesky({ title: "hi", url: "https://s.com/x" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/down/);
  });

  it("truncates long titles to keep text within 300 chars", async () => {
    configure();
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("createSession")) return sessionResponse();
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await postToBluesky({ title: "a".repeat(400), url: "https://s.com/x" });
    expect(r.ok).toBe(true);
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    const body = JSON.parse(String(calls[1][1].body));
    expect(body.record.text.length).toBeLessThanOrEqual(300);
    expect(body.record.text.endsWith("https://s.com/x")).toBe(true);
  });
});
