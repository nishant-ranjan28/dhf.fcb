import { describe, it, expect } from "vitest";
import { selectNewsItem, extractEntities } from "@/lib/autopost/select";
import type { NewsPost } from "@/lib/types";

function n(over: Partial<NewsPost> = {}): NewsPost {
  return {
    id: "x",
    slug: "x",
    title: "Untitled",
    content: "",
    category: "barca",
    createdAt: new Date().toISOString(),
    lang: "en",
    ...over,
  };
}

describe("extractEntities", () => {
  it("extracts capitalized multi-word names", () => {
    expect(extractEntities("Lamine Yamal extends Barcelona contract")).toContain("lamine yamal");
    expect(extractEntities("Lamine Yamal extends Barcelona contract")).toContain("barcelona");
  });
  it("ignores stop-words at sentence start", () => {
    const ents = extractEntities("Barcelona win against Real Madrid in El Clasico");
    expect(ents).toContain("barcelona");
    expect(ents).toContain("real madrid");
  });
  it("filters out source-noise tokens like 'Transfermarkt' / 'LaLiga'", () => {
    // These appeared as real false-positive entities in production logs.
    const ents = extractEntities("Tranfermarkt LaLiga Player of the Season: Yamal wins");
    expect(ents).not.toContain("tranfermarkt laliga");
    expect(ents).toContain("yamal");
  });
  it("filters generic header decoration like 'Breaking' / 'Official'", () => {
    const ents = extractEntities("Breaking: Yamal signs new deal");
    expect(ents).not.toContain("breaking");
    expect(ents).toContain("yamal");
  });
});

describe("selectNewsItem", () => {
  it("returns the most-recent English item with non-empty entities", () => {
    const items: NewsPost[] = [
      n({ id: "1", slug: "old", title: "Pedri scores", lang: "en", createdAt: "2026-05-13T10:00Z" }),
      n({ id: "2", slug: "new", title: "Yamal signs deal", lang: "en", createdAt: "2026-05-14T10:00Z" }),
    ];
    const got = selectNewsItem(items, { recentEntities: [], excludeSources: [] });
    expect(got?.source.id).toBe("2");
    expect(got?.entities).toContain("yamal");
  });

  it("skips items in non-English languages", () => {
    const items = [
      n({ id: "es", lang: "es", title: "Yamal firma contrato", createdAt: "2026-05-14T11:00Z" }),
      n({ id: "en", lang: "en", title: "Yamal signs deal", createdAt: "2026-05-14T10:00Z" }),
    ];
    const got = selectNewsItem(items, { recentEntities: [], excludeSources: [] });
    expect(got?.source.id).toBe("en");
  });

  it("skips items whose entities overlap recentEntities", () => {
    const items = [
      n({ id: "skip", lang: "en", title: "Yamal signs deal", createdAt: "2026-05-14T11:00Z" }),
      n({ id: "ok", lang: "en", title: "Pedri returns to training", createdAt: "2026-05-14T10:00Z" }),
    ];
    const got = selectNewsItem(items, { recentEntities: ["yamal"], excludeSources: [] });
    expect(got?.source.id).toBe("ok");
  });

  it("returns null when no eligible items remain", () => {
    const got = selectNewsItem([], { recentEntities: [], excludeSources: [] });
    expect(got).toBeNull();
  });

  it("respects excludeSources (per source-slug prefix)", () => {
    const items = [
      n({ id: "1", slug: "bbc-x-yamal", lang: "en", title: "Yamal signs", createdAt: "2026-05-14T11:00Z" }),
      n({ id: "2", slug: "guardian-x-pedri", lang: "en", title: "Pedri returns", createdAt: "2026-05-14T10:00Z" }),
    ];
    const got = selectNewsItem(items, { recentEntities: [], excludeSources: ["bbc-x"] });
    expect(got?.source.id).toBe("2");
  });
});
