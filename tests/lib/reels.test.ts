import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "@/app/api/cron/reels/route";
import { resetEnvCache } from "@/lib/env";

const ASSET = "https://github.com/nishant-ranjan28/dhf.fcb/releases/download/queue/a.mp4";

function req(body: unknown, token = "test-cron-token"): Request {
  return new Request("https://site.example/api/cron/reels", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function res(body: unknown, status = 200): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
}

beforeEach(() => {
  process.env.CRON_TOKEN = "test-cron-token";
  process.env.GROQ_API_KEY = "groq-key";
  process.env.FACEBOOK_PAGE_ID = "123";
  process.env.FACEBOOK_PAGE_ACCESS_TOKEN = "page-token";
  delete process.env.REELS_VIDEO_URL_PREFIX;
  resetEnvCache();
  vi.restoreAllMocks();
});

describe("/api/cron/reels", () => {
  it("rejects a missing or wrong token", async () => {
    expect((await POST(req({ action: "matches" }, "nope-nope-nope-nope"))).status).toBe(401);
    expect((await POST(req({ action: "matches" }, "wrong-cron-token"))).status).toBe(401);
  });

  it("rejects unknown actions and bad bodies", async () => {
    expect((await POST(req({ action: "nope" }))).status).toBe(400);
    expect((await POST(req({ action: "publish", videoUrl: ASSET }))).status).toBe(400);
  });

  it("returns Groq's JSON content for scripts", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      res({ choices: [{ message: { content: '{"videos":[]}' } }] }),
    );
    const r = await POST(req({ action: "scripts", system: "s", prompt: "p" }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, content: '{"videos":[]}', model: "openai/gpt-oss-20b" });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer groq-key");
  });

  it("uses an allowed larger model and falls back to the site model if it is unavailable", async () => {
    const models: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const model = (JSON.parse(String(init?.body)) as { model: string }).model;
      models.push(model);
      return model === "openai/gpt-oss-120b"
        ? res({ error: { message: "model not found" } }, 404)
        : res({ choices: [{ message: { content: "{}" } }] });
    });
    const r = await POST(req({ action: "scripts", system: "s", prompt: "p", model: "openai/gpt-oss-120b" }));
    expect(await r.json()).toEqual({ ok: true, content: "{}", model: "openai/gpt-oss-20b" });
    expect(models).toEqual(["openai/gpt-oss-120b", "openai/gpt-oss-20b"]);
  });

  it("ignores a model that is not on the allow-list", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      res({ choices: [{ message: { content: "{}" } }] }),
    );
    await POST(req({ action: "scripts", system: "s", prompt: "p", model: "some/expensive-model" }));
    expect((JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body)) as { model: string }).model).toBe(
      "openai/gpt-oss-20b",
    );
  });

  it("reports a Groq failure as 502 without throwing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(res("rate limited", 429));
    const r = await POST(req({ action: "scripts", system: "s", prompt: "p" }));
    expect(r.status).toBe(502);
    expect((await r.json()).ok).toBe(false);
  });

  it("returns the coach and squad from football-data", async () => {
    process.env.FOOTBALL_DATA_API_KEY = "fd-key";
    resetEnvCache();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      res({ coach: { name: "Coach Name" }, squad: [{ name: "Player One", position: "Defence" }, { position: "Offence" }] }),
    );
    const r = await POST(req({ action: "squad" }));
    expect(await r.json()).toEqual({
      ok: true,
      coach: "Coach Name",
      players: [{ name: "Player One", position: "Defence" }],
    });
    expect(((fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>)["X-Auth-Token"]).toBe("fd-key");
  });

  it("refuses to publish a video that is not a release asset of this repo", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const r = await POST(req({ action: "publish", videoUrl: "https://evil.example/a.mp4", description: "d" }));
    expect(r.status).toBe(502);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("downloads, uploads, publishes and comments", async () => {
    const calls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      calls.push(url);
      if (url === ASSET) return new Response(new Uint8Array([1, 2, 3]));
      if (url.endsWith("/123/video_reels")) {
        const phase = (init?.body as URLSearchParams).get("upload_phase");
        return phase === "start"
          ? res({ video_id: "999", upload_url: "https://rupload.facebook.com/video-upload/v27.0/999" })
          : res({ success: true });
      }
      if (url.includes("rupload")) {
        expect((init?.headers as Record<string, string>).file_size).toBe("3");
        return res({ success: true });
      }
      if (url.endsWith("/999/comments")) return res({ id: "c1" });
      return res("unexpected", 500);
    });
    const r = await POST(req({ action: "publish", videoUrl: ASSET, description: "d", comment: "more" }));
    expect(await r.json()).toEqual({ ok: true, id: "999", commented: true });
    expect(calls).toHaveLength(5);
  });

  it("still succeeds when the link comment fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === ASSET) return new Response(new Uint8Array([1]));
      if (url.endsWith("/comments")) return res({ error: { message: "no permission" } }, 403);
      if (url.endsWith("/video_reels") && (init?.body as URLSearchParams).get("upload_phase") === "start") {
        return res({ video_id: "7" });
      }
      return res({ success: true });
    });
    const r = await POST(req({ action: "publish", videoUrl: ASSET, description: "d", comment: "more" }));
    expect(await r.json()).toEqual({ ok: true, id: "7", commented: false });
  });

  it("posts a photo card with its caption and comments on the post", async () => {
    const calls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      calls.push(url);
      if (url === ASSET) return new Response(new Uint8Array([9, 9]));
      if (url.endsWith("/123/photos")) {
        const form = init?.body as FormData;
        expect(form.get("caption")).toBe("cap");
        expect((form.get("source") as Blob).size).toBe(2);
        return res({ id: "555", post_id: "123_777" });
      }
      if (url.endsWith("/123_777/comments")) return res({ id: "c1" });
      return res("unexpected", 500);
    });
    const r = await POST(req({ action: "photo", imageUrl: ASSET, caption: "cap", comment: "more" }));
    expect(await r.json()).toEqual({ ok: true, id: "123_777", commented: true });
    expect(calls).toHaveLength(3);
  });

  it("refuses a photo that is not a release asset of this repo", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const r = await POST(req({ action: "photo", imageUrl: "https://evil.example/a.jpg", caption: "c" }));
    expect(r.status).toBe(502);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("starts publish every hour and generate in the morning, with force off", async () => {
    process.env.GITHUB_DISPATCH_TOKEN = "gh-token";
    const { dispatchReelWorkflows } = await import("@/lib/reels");
    const urls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      urls.push(String(input));
      expect(JSON.parse(String(init?.body))).toEqual({ ref: "main", inputs: { force: "false" } });
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer gh-token");
      return new Response(null, { status: 204 });
    });
    // 02:00 UTC = 07:30 IST: both workflows
    expect(await dispatchReelWorkflows(new Date("2026-11-22T02:00:00Z"))).toEqual({
      ok: true,
      started: ["reels-generate.yml", "reels-publish.yml"],
      errors: {},
    });
    // 12:00 UTC = 17:30 IST: publish only
    urls.length = 0;
    await dispatchReelWorkflows(new Date("2026-11-22T12:00:00Z"));
    expect(urls).toEqual([
      "https://api.github.com/repos/nishant-ranjan28/dhf.fcb/actions/workflows/reels-publish.yml/dispatches",
    ]);
    delete process.env.GITHUB_DISPATCH_TOKEN;
  });

  it("treats an empty body as the hourly trigger", async () => {
    delete process.env.GITHUB_DISPATCH_TOKEN;
    const r = await POST(
      new Request("https://site.example/api/cron/reels", {
        method: "POST",
        headers: { authorization: "Bearer test-cron-token" },
      }),
    );
    expect(r.status).toBe(502);
    expect((await r.json()).error).toMatch(/GITHUB_DISPATCH_TOKEN/);
  });

  it("fails cleanly when Facebook is not configured", async () => {
    delete process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
    const r = await POST(req({ action: "publish", videoUrl: ASSET, description: "d" }));
    expect(r.status).toBe(502);
    expect((await r.json()).error).toMatch(/not configured/);
  });
});
