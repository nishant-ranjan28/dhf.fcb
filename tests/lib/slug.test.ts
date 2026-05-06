import { describe, it, expect } from "vitest";
import { matchSlug, toSlug } from "@/lib/slug";

describe("toSlug", () => {
  it("lowercases and hyphenates", () => {
    expect(toSlug("FC Barcelona")).toBe("fc-barcelona");
  });
  it("strips diacritics", () => {
    expect(toSlug("Atlético Madrid")).toBe("atletico-madrid");
  });
});

describe("matchSlug", () => {
  it("joins teams with -vs-", () => {
    expect(matchSlug("FC Barcelona", "Real Madrid")).toBe(
      "fc-barcelona-vs-real-madrid",
    );
  });
});
