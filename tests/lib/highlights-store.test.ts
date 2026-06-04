import { describe, it, expect, beforeEach } from "vitest";
import {
  highlightsStore,
  parseYouTubeId,
  _resetHighlightsStore,
} from "@/lib/highlights/store";

describe("parseYouTubeId", () => {
  it("accepts a bare 11-char id", () => {
    expect(parseYouTubeId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });
  it("extracts from a watch URL", () => {
    expect(parseYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });
  it("extracts from a youtu.be short URL", () => {
    expect(parseYouTubeId("https://youtu.be/dQw4w9WgXcQ?t=10")).toBe("dQw4w9WgXcQ");
  });
  it("extracts from an embed URL", () => {
    expect(parseYouTubeId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });
  it("extracts from a shorts URL", () => {
    expect(parseYouTubeId("https://youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });
  it("returns null for garbage", () => {
    expect(parseYouTubeId("not a video")).toBeNull();
    expect(parseYouTubeId("")).toBeNull();
  });
});

describe("highlightsStore (in-memory fallback)", () => {
  beforeEach(async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    _resetHighlightsStore();
    await highlightsStore()._reset?.();
  });

  it("starts empty", async () => {
    expect(await highlightsStore().list()).toEqual([]);
  });

  it("adds a highlight and lists it", async () => {
    const h = await highlightsStore().add({ url: "https://youtu.be/dQw4w9WgXcQ", title: "Wonder goal" });
    expect(h.youtubeId).toBe("dQw4w9WgXcQ");
    expect(h.title).toBe("Wonder goal");
    const list = await highlightsStore().list();
    expect(list).toHaveLength(1);
    expect(list[0].youtubeId).toBe("dQw4w9WgXcQ");
  });

  it("rejects an unparseable url", async () => {
    await expect(highlightsStore().add({ url: "nope", title: "x" })).rejects.toThrow();
  });

  it("lists most-recently-added first", async () => {
    await highlightsStore().add({ url: "aaaaaaaaaaa", title: "first" });
    await highlightsStore().add({ url: "bbbbbbbbbbb", title: "second" });
    const list = await highlightsStore().list();
    expect(list.map((h) => h.title)).toEqual(["second", "first"]);
  });

  it("deletes by youtubeId", async () => {
    await highlightsStore().add({ url: "aaaaaaaaaaa", title: "first" });
    expect(await highlightsStore().remove("aaaaaaaaaaa")).toBe(true);
    expect(await highlightsStore().list()).toEqual([]);
    expect(await highlightsStore().remove("aaaaaaaaaaa")).toBe(false);
  });
});
