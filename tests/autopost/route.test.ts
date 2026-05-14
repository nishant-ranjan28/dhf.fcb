import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "@/app/api/cron/auto-post/route";
import { _resetBlogStore, blogStore } from "@/lib/blog/store";
import { _resetAutopostState, autopostState } from "@/lib/autopost/state";
import { resetEnvCache } from "@/lib/env";

beforeEach(async () => {
  _resetBlogStore();
  _resetAutopostState();
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.AUTOPOST_ENABLED;
  process.env.CRON_TOKEN = "test-cron-token";
  process.env.SITE_URL = "https://site.example";
  resetEnvCache();
  await blogStore()._reset?.();
  await autopostState()._reset?.();
  vi.restoreAllMocks();
});

function withAuth(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/cron/auto-post", {
    method: "POST",
    headers: { authorization: "Bearer test-cron-token", ...headers },
  });
}

describe("POST /api/cron/auto-post", () => {
  it("returns 401 without bearer", async () => {
    const r = await POST(new Request("http://localhost/api/cron/auto-post", { method: "POST" }));
    expect(r.status).toBe(401);
  });

  it("returns 401 with wrong bearer", async () => {
    const r = await POST(
      new Request("http://localhost/api/cron/auto-post", {
        method: "POST",
        headers: { authorization: "Bearer nope" },
      }),
    );
    expect(r.status).toBe(401);
  });

  it("returns 200 + disabled when AUTOPOST_ENABLED=false", async () => {
    process.env.AUTOPOST_ENABLED = "false";
    resetEnvCache();
    const r = await POST(withAuth());
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body).toMatchObject({ status: "skipped", reason: "disabled" });
  });

  // Note: a full happy-path test through this route would require mocking
  // fetchAllNews, generateDraft, and announce — too much surface for a unit
  // test. The pipeline test (Task 8) already covers that. We just confirm
  // here that the route auths correctly and forwards results.
});
