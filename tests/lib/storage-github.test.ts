import { afterEach, describe, it, expect, vi } from "vitest";
import { docPath, githubDocStore } from "@/lib/storage/github";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("GitHub document store", () => {
  it("creates collision-free paths", () => {
    expect(docPath("blog:post:my-story")).toMatch(
      /^data\/store\/blog_post_my-story-[0-9a-f]{10}\.json$/,
    );
    expect(docPath("blog:post:my-story")).toBe(docPath("blog:post:my-story"));
    expect(docPath("blog:post:other")).not.toBe(docPath("blog:post:my-story"));
  });

  it("reads, writes and deletes JSON documents through the Contents API", async () => {
    vi.stubEnv("GITHUB_BLOG_TOKEN", "test-token");
    vi.stubEnv("GITHUB_BLOG_REPO", "owner/repo");
    let stored = "";
    const requests: { url: string; method: string }[] = [];

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      requests.push({ url, method });
      if (method === "GET" && url.includes("?ref=")) {
        return stored
          ? json({ sha: "sha1", content: stored })
          : json({}, 404);
      }
      if (method === "PUT") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { content: string };
        stored = body.content;
        return json({ content: {} }, 201);
      }
      if (method === "DELETE") return json({ content: {} }, 200);
      return json({}, 404);
    });

    const store = githubDocStore();
    expect(await store.get("blog:post:x")).toBeNull();

    await store.set("blog:post:x", { value: { slug: "x" } });
    const put = requests.find((r) => r.method === "PUT");
    expect(put?.url).toContain(docPath("blog:post:x"));
    expect(put?.url).not.toContain("?");

    // Fresh instance avoids the 10-second read cache.
    expect((await githubDocStore().get("blog:post:x"))?.value).toEqual({ slug: "x" });

    await store.del("blog:post:x");
    expect(requests.some((r) => r.method === "DELETE")).toBe(true);
  });
});
