import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { mapApiFootballEvents } from "@/lib/football/providers/apiFootball";

describe("mapApiFootballEvents", () => {
  it("maps goals and cards", async () => {
    const raw = JSON.parse(
      await readFile("tests/fixtures/api-football-events.json", "utf8"),
    );
    const out = mapApiFootballEvents(raw, "FC Barcelona");
    expect(out).toEqual([
      { minute: 12, type: "goal", team: "home", player: "Lewandowski", detail: undefined },
      { minute: 28, type: "yellow", team: "away", player: "Vinícius", detail: undefined },
    ]);
  });

  it("maps substitutions and red cards", () => {
    const raw = {
      response: [
        { time: { elapsed: 60 }, team: { name: "Real Madrid" }, player: { name: "Bellingham" }, type: "subst", detail: "Substitution 1" },
        { time: { elapsed: 75 }, team: { name: "FC Barcelona" }, player: { name: "Araújo" }, type: "Card", detail: "Red Card" },
      ],
    };
    const out = mapApiFootballEvents(raw, "FC Barcelona");
    expect(out).toEqual([
      { minute: 60, type: "sub", team: "away", player: "Bellingham", detail: undefined },
      { minute: 75, type: "red", team: "home", player: "Araújo", detail: undefined },
    ]);
  });
});
