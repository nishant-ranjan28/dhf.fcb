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
    if (u.includes("refresh_access_token")) {
      // Meta rejects refresh of tokens younger than 24h — fall back to the original.
      return new Response(JSON.stringify({ error: { message: "too new" } }), { status: 400 });
    }
    if (u.includes("/me?")) {
      return new Response(JSON.stringify({ id: "me-user" }), { status: 200 });
    }
    if (u.endsWith("/threads")) {
      return new Response(JSON.stringify({ id: "creation-1" }), { status: 200 });
    }
    return new Response(
      JSON.stringify({
        id: "post-1",
        permalink: "https://www.threads.net/@imnishu/post/post-1",
      }),
      { status: 200 },
    );
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

  it("refreshes, creates then publishes a text thread", async () => {
    configure();
    const mock = fetchMock();
    vi.stubGlobal("fetch", mock);
    const r = await postToThreads({ title: "Yamal signs", url: "https://s.com/blog/yamal" });
    expect(r).toEqual({
      ok: true,
      id: "post-1",
      url: "https://www.threads.net/@imnishu/post/post-1",
    });

    const calls = mock.mock.calls as unknown as [string, RequestInit][];
    // refresh token → create container → publish → resolve permalink
    expect(calls).toHaveLength(4);
    expect(String(calls[0][0])).toContain("refresh_access_token");

    const [createUrl, createInit] = calls[1];
    expect(String(createUrl)).toBe("https://graph.threads.net/v1.0/user-1/threads");
    const createBody = new URLSearchParams(String(createInit.body));
    expect(createBody.get("media_type")).toBe("TEXT");
    expect(createBody.get("text")).toBe("Yamal signs\n\nhttps://s.com/blog/yamal");
    expect(createBody.get("access_token")).toBe("token123");

    const [publishUrl, publishInit] = calls[2];
    expect(String(publishUrl)).toBe("https://graph.threads.net/v1.0/user-1/threads_publish");
    const publishBody = new URLSearchParams(String(publishInit.body));
    expect(publishBody.get("creation_id")).toBe("creation-1");
    expect(String(calls[3][0])).toContain("fields=permalink");
  });

  it("uses a refreshed token when Meta returns one", async () => {
    configure();
    const mock = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("refresh_access_token")) {
        return new Response(JSON.stringify({ access_token: "fresh" }), { status: 200 });
      }
      if (u.endsWith("/threads")) {
        return new Response(JSON.stringify({ id: "creation-1" }), { status: 200 });
      }
      return new Response(JSON.stringify({ id: "post-1" }), { status: 200 });
    });
    vi.stubGlobal("fetch", mock);
    const r = await postToThreads({ title: "hi", url: "https://s.com/x" });
    expect(r.ok).toBe(true);
    const calls = mock.mock.calls as unknown as [string, RequestInit][];
    const createBody = new URLSearchParams(String(calls[1][1].body));
    expect(createBody.get("access_token")).toBe("fresh");
  });

  it("resolves the user id from /me when THREADS_USER_ID is absent", async () => {
    process.env.THREADS_ACCESS_TOKEN = "token123";
    const mock = fetchMock();
    vi.stubGlobal("fetch", mock);
    const r = await postToThreads({ title: "hi", url: "https://s.com/x" });
    expect(r.ok).toBe(true);
    const calls = mock.mock.calls as unknown as [string][];
    expect(String(calls[1][0])).toContain("/me?fields=id");
    expect(String(calls[2][0])).toContain("/me-user/threads");
  });

  it("retries publish on transient Media Not Found error", async () => {
    configure();
    let publishAttempts = 0;
    const mock = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("refresh_access_token")) {
        return new Response(JSON.stringify({ error: { message: "too new" } }), { status: 400 });
      }
      if (u.endsWith("/threads") && !u.includes("publish")) {
        return new Response(JSON.stringify({ id: "creation-1" }), { status: 200 });
      }
      if (u.includes("threads_publish")) {
        publishAttempts++;
        if (publishAttempts === 1) {
          return new Response(
            JSON.stringify({
              error: {
                message: "The requested resource does not exist",
                code: 24,
                error_subcode: 4279009,
                error_user_title: "Media Not Found",
              },
            }),
            { status: 400 },
          );
        }
        return new Response(JSON.stringify({ id: "post-1" }), { status: 200 });
      }
      return new Response(JSON.stringify({ id: "post-1" }), { status: 200 });
    });
    vi.stubGlobal("fetch", mock);
    const r = await postToThreads({ title: "hi", url: "https://s.com/x" });
    expect(r.ok).toBe(true);
    expect(r.id).toBe("post-1");
    expect(publishAttempts).toBe(2);
  });

  it("does not retry publish on non-transient errors", async () => {
    configure();
    let publishAttempts = 0;
    const mock = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("refresh_access_token")) {
        return new Response(JSON.stringify({ error: { message: "too new" } }), { status: 400 });
      }
      if (u.endsWith("/threads") && !u.includes("publish")) {
        return new Response(JSON.stringify({ id: "creation-1" }), { status: 200 });
      }
      if (u.includes("threads_publish")) {
        publishAttempts++;
        return new Response("forbidden", { status: 403 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    vi.stubGlobal("fetch", mock);
    const r = await postToThreads({ title: "hi", url: "https://s.com/x" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/403/);
    expect(publishAttempts).toBe(1);
  });

  it("returns ok=false when creation fails", async () => {
    configure();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad", { status: 400 })));
    const r = await postToThreads({ title: "hi", url: "https://s.com/x" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/400/);
  });
});
