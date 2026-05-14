import { describe, it, expect } from "vitest";
import {
  wordCountGate,
  duplicateTopicGate,
  bannedPhrasesGate,
  entityCoverageGate,
} from "@/lib/autopost/gates";

describe("wordCountGate", () => {
  it("passes when body has at least 600 words", () => {
    const body = "word ".repeat(600).trim();
    expect(wordCountGate(body)).toBe(true);
  });
  it("fails under 600 words", () => {
    expect(wordCountGate("word ".repeat(599).trim())).toBe(false);
  });
  it("ignores markdown when counting", () => {
    // 600 'word' tokens wrapped in markdown noise should still pass.
    const body = "# Title\n\n" + "**word** ".repeat(600);
    expect(wordCountGate(body)).toBe(true);
  });
});

describe("duplicateTopicGate", () => {
  it("passes when no recent title overlaps significantly", () => {
    const ok = duplicateTopicGate({
      newTitle: "Yamal extends his Barcelona contract",
      recentTitles: ["Pedri injury update", "Champions League draw revealed"],
      newEntities: ["yamal"],
      recentEntities: ["pedri"],
    });
    expect(ok).toBe(true);
  });
  it("fails when title Jaccard similarity >= 0.5", () => {
    const ok = duplicateTopicGate({
      newTitle: "Yamal extends his Barcelona contract",
      recentTitles: ["Yamal extends Barcelona contract through 2030"],
      newEntities: ["yamal"],
      recentEntities: ["yamal"],
    });
    expect(ok).toBe(false);
  });
  it("fails when a new entity is in recentEntities (overlap)", () => {
    const ok = duplicateTopicGate({
      newTitle: "Totally different headline about football tactics",
      recentTitles: ["Some unrelated headline about transfers"],
      newEntities: ["lewandowski"],
      recentEntities: ["lewandowski"],
    });
    expect(ok).toBe(false);
  });
});

describe("bannedPhrasesGate", () => {
  it("passes a clean post", () => {
    expect(bannedPhrasesGate("Barcelona played a strong first half.")).toBe(true);
  });
  it.each([
    "As an AI, I cannot comment on tactics.",
    "As a language model, I would say…",
    "I cannot provide opinions.",
    "I'm sorry, but I can't help with that.",
  ])("fails on AI-leak phrase: %s", (body) => {
    expect(bannedPhrasesGate(body)).toBe(false);
  });
  it("fails when a paragraph repeats verbatim", () => {
    const para = "Barcelona dominated possession throughout the second half. Their press disrupted the visiting midfield. The crowd lifted the team across the closing minutes of the game.";
    const body = `${para}\n\n${para}`;
    expect(bannedPhrasesGate(body)).toBe(false);
  });
});

describe("entityCoverageGate", () => {
  it("passes when every headline entity appears in body", () => {
    const ok = entityCoverageGate({
      entities: ["yamal", "barcelona"],
      body: "Lamine Yamal signed for Barcelona last week.",
    });
    expect(ok).toBe(true);
  });
  it("fails when a headline entity is missing from body", () => {
    const ok = entityCoverageGate({
      entities: ["yamal", "pedri"],
      body: "Lamine Yamal trained with the squad today.",
    });
    expect(ok).toBe(false);
  });
  it("matches case-insensitively", () => {
    const ok = entityCoverageGate({
      entities: ["yamal"],
      body: "YAMAL was named in the starting eleven.",
    });
    expect(ok).toBe(true);
  });
});
