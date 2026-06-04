import { describe, it, expect } from "vitest";
import {
  broadcastersFor,
  orderByViewerRegion,
  regionFromLocale,
} from "@/data/broadcasters";

describe("regionFromLocale", () => {
  it("reads the region subtag", () => {
    expect(regionFromLocale("en-US")).toBe("US");
    expect(regionFromLocale("en-GB")).toBe("GB");
    expect(regionFromLocale("es-ES")).toBe("ES");
    expect(regionFromLocale("hi-IN")).toBe("IN");
  });
  it("uppercases and handles extended tags", () => {
    expect(regionFromLocale("en-us")).toBe("US");
    expect(regionFromLocale("zh-Hant-TW")).toBe("TW");
  });
  it("returns null when there is no region subtag", () => {
    expect(regionFromLocale("en")).toBeNull();
    expect(regionFromLocale("")).toBeNull();
  });
});

describe("broadcastersFor", () => {
  it("returns World Cup broadcasters for fifa", () => {
    const list = broadcastersFor("fifa");
    expect(list.length).toBeGreaterThan(0);
    // A global option should always be present.
    expect(list.some((b) => b.code === "GLOBAL")).toBe(true);
  });
  it("returns a non-empty list for barca", () => {
    expect(broadcastersFor("barca").length).toBeGreaterThan(0);
  });
});

describe("orderByViewerRegion", () => {
  const list = broadcastersFor("fifa");

  it("puts the viewer's region first when it matches", () => {
    const ordered = orderByViewerRegion(list, "GB");
    expect(ordered[0].code).toBe("GB");
  });

  it("keeps the original order when the region is unknown", () => {
    const ordered = orderByViewerRegion(list, null);
    expect(ordered.map((b) => b.code)).toEqual(list.map((b) => b.code));
  });

  it("never drops or duplicates entries", () => {
    const ordered = orderByViewerRegion(list, "US");
    expect(ordered).toHaveLength(list.length);
    expect(new Set(ordered.map((b) => b.code)).size).toBe(list.length);
  });
});
