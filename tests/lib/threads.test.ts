import { describe, it, expect, vi, beforeEach } from "vitest";
import { isThreadsConfigured, postToThreads } from "@/lib/threads";

beforeEach(() => {
  vi.restoreAllMocks();
  delete process.env.THREADS_ACCESS_TOKEN;
  delete process.env.THREADS_USER_ID;
});

function configure() {
  process.env.THREADS_ACCESS_TOKEN = "token123";
  process.env.THREADS_USER_ID = "user-1";
}

function fetchMock() {
  return vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes("/me?")) {
      return new Response(JSON.stringify({ id: "me-user" }), { status: 200 });
    }
    if (u.endsWith("/threads")) {
      return new Response(JSON.stringify({ id: "creation-1" }), { status: 200 });
    }
    return new Response(JSON.stringify({ id: "post-1" }), { status: 200 });
  });
}

describe("isThreadsConfigured", () => {
  it("only needs the token (user id is resolved from /me when absent)", () => {
    expect(isThreadsConfigured()).toBe(false);
    process.env.THREADS_ACCESS_TOKEN = "t";
    expect(isThreadsConfigured()).toBe(true);
  });
});

describe("postToThreads", () => {
  it("returns ok=false when not configured", async () => {
    const r = await postToThreads({ title: "hi", url: "https://s.com/x" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not configured/i);
  });

  it("creates then publishes a text thread", async () => {
    configure();
    const mock = fetchMock();
    vi.stubGlobal("fetch", mock);
    const r = await postToThreads({ title: "Yamal signs", url: "https://s.com/blog/yamal" });
    expect(r).toEqual({ ok: true, id: "post-1" });

    const calls = mock.mock.calls as unknown as [string, RequestInit][];
    expect(calls).toHaveLength(2);
    const [createUrl, createInit] = calls[0];
    expect(String(createUrl)).toBe("https://graph.threads.net/v1.0/user-1/threads");
    const createBody = new URLSearchParams(String(createInit.body));
    expect(createBody.get("media_type")).toBe("TEXT");
    expect(createBody.get("text")).toBe("Yamal signs\n\nhttps://s.com/blog/yamal");
    expect(createBody.get("access_token")).toBe("token123");

    const [publishUrl, publishInit] = calls[1];
    expect(String(publishUrl)).toBe("https://graph.threads.net/v1.0/user-1/threads_publish");
    const publishBody = new URLSearchParams(String(publishInit.body));
    expect(publishBody.get("creation_id")).toBe("creation-1");
  });

  it("resolves the user id from /me when THREADS_USER_ID is absent", async () => {
    process.env.THREADS_ACCESS_TOKEN = "token123";
    const mock = fetchMock();
    vi.stubGlobal("fetch", mock);
    const r = await postToThreads({ title: "hi", url: "https://s.com/x" });
    expect(r.ok).toBe(true);
    const calls = mock.mock.calls as unknown as [string][];
    expect(String(calls[0][0])).toContain("/me?fields=id");
    expect(String(calls[1][0])).toContain("/me-user/threads");
  });

  it("returns ok=false when creation fails", async () => {
    configure();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad", { status: 400 })));
    const r = await postToThreads({ title: "hi", url: "https://s.com/x" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/400/);
  });
});
