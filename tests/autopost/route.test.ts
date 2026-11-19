import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "@/app/api/cron/auto-post/route";
import { _resetBlogStore, blogStore } from "@/lib/blog/store";
import { _resetAutopostState, autopostState } from "@/lib/autopost/state";
import { resetEnvCache } from "@/lib/env";

// In production the pipeline runs via Next's `after()` (outside a request
// scope it throws). Capture the callback here so tests can drain it.
const { afterTasks } = vi.hoisted(() => ({
  afterTasks: [] as Array<() => unknown>,
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (task: () => unknown) => {
      afterTasks.push(task);
    },
  };
});

beforeEach(async () => {
  afterTasks.length = 0;
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

/** Run the background task(s) scheduled by `after()` and return their results. */
async function drainAfter(): Promise<unknown[]> {
  const tasks = afterTasks.splice(0);
  return Promise.all(tasks.map((task) => Promise.resolve(task())));
}

describe("POST /api/cron/auto-post", () => {
  it("returns 401 without bearer", async () => {
    const r = await POST(new Request("http://localhost/api/cron/auto-post", { method: "POST" }));
    expect(r.status).toBe(401);
    expect(afterTasks).toHaveLength(0);
  });

  it("returns 401 with wrong bearer", async () => {
    const r = await POST(
      new Request("http://localhost/api/cron/auto-post", {
        method: "POST",
        headers: { authorization: "Bearer nope" },
      }),
    );
    expect(r.status).toBe(401);
    expect(afterTasks).toHaveLength(0);
  });

  it("acks immediately and runs the pipeline out-of-band", async () => {
    process.env.AUTOPOST_ENABLED = "false";
    resetEnvCache();
    const r = await POST(withAuth());
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ status: "accepted" });
    expect(afterTasks).toHaveLength(1);

    const [result] = await drainAfter();
    expect(result).toMatchObject({ status: "skipped", reason: "disabled" });
    expect(await autopostState().getLastRun()).toMatchObject({
      status: "skipped",
      reason: "disabled",
    });
  });

  // Note: a full happy-path test through this route would require mocking
  // fetchAllNews, generateDraft, and announce — too much surface for a unit
  // test. The pipeline test (Task 8) already covers that. We just confirm
  // here that the route auths correctly, acks fast and forwards results.
});
