import { describe, it, expect, beforeEach } from "vitest";
import { blogStore, deriveExcerpt, _resetBlogStore } from "@/lib/blog/store";

describe("blogStore (in-memory fallback)", () => {
  beforeEach(async () => {
    _resetBlogStore();
    // Force memory path by ensuring no Redis env.
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const s = blogStore();
    await s._reset?.();
  });

  it("creates, lists, and reads back a post", async () => {
    const s = blogStore();
    const post = await s.create({
      title: "First post",
      body: "Hello **world**",
    });
    expect(post.slug).toBe("first-post");
    expect(post.title).toBe("First post");
    expect(post.author).toBe("BarcaPulse");
    expect(post.createdAt).toBe(post.updatedAt);

    const got = await s.get("first-post");
    expect(got).toEqual(post);

    const list = await s.list();
    expect(list).toHaveLength(1);
    expect(list[0].slug).toBe("first-post");
  });

  it("lists posts newest-first", async () => {
    const s = blogStore();
    await s.create({ title: "Old post", body: "x" });
    await new Promise((r) => setTimeout(r, 5));
    await s.create({ title: "New post", body: "y" });
    const list = await s.list();
    expect(list.map((p) => p.slug)).toEqual(["new-post", "old-post"]);
  });

  it("rejects empty-slug titles", async () => {
    const s = blogStore();
    await expect(s.create({ title: "   ", body: "x" })).rejects.toThrow(/empty slug/);
    await expect(s.create({ title: "!!!", body: "x" })).rejects.toThrow(/empty slug/);
  });

  it("deletes posts", async () => {
    const s = blogStore();
    await s.create({ title: "To delete", body: "x" });
    expect(await s.delete("to-delete")).toBe(true);
    expect(await s.get("to-delete")).toBeNull();
    expect(await s.delete("to-delete")).toBe(false);
  });

  it("normalizes tags (trim, lowercase, drop empty)", async () => {
    const s = blogStore();
    const p = await s.create({
      title: "Tagged",
      body: "x",
      tags: ["  Barca ", "FIFA", "", "  "],
    });
    expect(p.tags).toEqual(["barca", "fifa"]);
  });

  it("derives excerpt from body when not provided", async () => {
    const s = blogStore();
    const p = await s.create({
      title: "Auto excerpt",
      body: "**Bold** opening line with [a link](https://x). More text follows the first paragraph.",
    });
    expect(p.excerpt).toContain("Bold opening line");
    expect(p.excerpt).toContain("a link");
    expect(p.excerpt).not.toContain("**");
    expect(p.excerpt).not.toContain("[");
    expect(p.excerpt.length).toBeLessThanOrEqual(240);
  });

  it("respects an explicit excerpt", async () => {
    const s = blogStore();
    const p = await s.create({
      title: "Explicit",
      body: "Lots of body text here",
      excerpt: "Custom summary",
    });
    expect(p.excerpt).toBe("Custom summary");
  });

  it("paginates via list({limit, offset})", async () => {
    const s = blogStore();
    for (let i = 0; i < 5; i++) {
      await s.create({ title: `Post ${i}`, body: "x" });
      await new Promise((r) => setTimeout(r, 2));
    }
    const page1 = await s.list({ limit: 2, offset: 0 });
    const page2 = await s.list({ limit: 2, offset: 2 });
    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(2);
    expect(page1[0].slug).not.toBe(page2[0].slug);
  });
});

describe("deriveExcerpt", () => {
  it("strips markdown formatting", () => {
    expect(deriveExcerpt("# Hello\n\n**Bold** text")).toMatch(/Hello\s+Bold text/);
  });
  it("strips images and unwraps links", () => {
    expect(deriveExcerpt("![alt](img.png) See [docs](https://x).")).toMatch(/See docs/);
  });
  it("caps at 240 chars", () => {
    const long = "word ".repeat(200);
    expect(deriveExcerpt(long).length).toBeLessThanOrEqual(240);
  });
});
