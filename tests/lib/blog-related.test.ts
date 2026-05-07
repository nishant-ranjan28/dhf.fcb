import { describe, it, expect } from "vitest";
import { adjacentPosts, relatedPosts } from "@/lib/blog/related";
import type { BlogPost } from "@/lib/blog/types";

function makePost(slug: string, tags: string[], createdAt: string): BlogPost {
  return {
    slug,
    title: slug,
    excerpt: "",
    body: "",
    tags,
    createdAt,
    updatedAt: createdAt,
    author: "test",
  };
}

// Newest-first ordering (matches blogStore.list output).
const POSTS: BlogPost[] = [
  makePost("post-d", ["yamal", "tactics"], "2026-05-04T10:00:00Z"),
  makePost("post-c", ["yamal"], "2026-05-03T10:00:00Z"),
  makePost("post-b", ["transfer"], "2026-05-02T10:00:00Z"),
  makePost("post-a", ["yamal", "tactics"], "2026-05-01T10:00:00Z"),
];

describe("adjacentPosts", () => {
  it("returns newer + older for a middle post", () => {
    const { newer, older } = adjacentPosts(POSTS, "post-c");
    expect(newer?.slug).toBe("post-d");
    expect(older?.slug).toBe("post-b");
  });

  it("first post has no newer", () => {
    const { newer, older } = adjacentPosts(POSTS, "post-d");
    expect(newer).toBeUndefined();
    expect(older?.slug).toBe("post-c");
  });

  it("last post has no older", () => {
    const { newer, older } = adjacentPosts(POSTS, "post-a");
    expect(newer?.slug).toBe("post-b");
    expect(older).toBeUndefined();
  });

  it("unknown slug returns empty", () => {
    expect(adjacentPosts(POSTS, "nope")).toEqual({});
  });
});

describe("relatedPosts", () => {
  it("excludes the current post", () => {
    const out = relatedPosts(POSTS, "post-c", 3);
    expect(out.find((p) => p.slug === "post-c")).toBeUndefined();
  });

  it("ranks tag overlap above pure recency", () => {
    // post-c has tag 'yamal'. post-d (yamal+tactics) and post-a (yamal+tactics)
    // share 1 tag each. post-b (transfer) shares 0. So d, a should rank above b
    // even though b is more recent than a.
    const out = relatedPosts(POSTS, "post-c", 3);
    expect(out.map((p) => p.slug)).toEqual(["post-d", "post-a", "post-b"]);
  });

  it("orders ties by recency", () => {
    // post-d shares 2 tags with post-a, post-c shares 1, post-b shares 0.
    // From post-a's perspective: d=2, c=1, b=0 → d, c, b.
    const out = relatedPosts(POSTS, "post-a", 3);
    expect(out.map((p) => p.slug)).toEqual(["post-d", "post-c", "post-b"]);
  });

  it("returns the requested count and never the current", () => {
    expect(relatedPosts(POSTS, "post-c", 1)).toHaveLength(1);
    expect(relatedPosts(POSTS, "post-c", 10)).toHaveLength(3);
  });

  it("falls back to recency when current isn't in the list", () => {
    const out = relatedPosts(POSTS, "missing", 2);
    expect(out.map((p) => p.slug)).toEqual(["post-d", "post-c"]);
  });
});
