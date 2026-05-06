import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import {
  mapApiFootballEvents,
  normalizeTeamName,
} from "@/lib/football/providers/apiFootball";

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

  it("treats Second Yellow card as a red", () => {
    const raw = {
      response: [
        { time: { elapsed: 80 }, team: { name: "FC Barcelona" }, player: { name: "Pedri" }, type: "Card", detail: "Second Yellow card" },
      ],
    };
    const out = mapApiFootballEvents(raw, "FC Barcelona");
    expect(out[0].type).toBe("red");
  });

  it("classifies penalty and own-goal as goal", () => {
    const raw = {
      response: [
        { time: { elapsed: 23 }, team: { name: "FC Barcelona" }, player: { name: "Lewandowski" }, type: "Goal", detail: "Penalty" },
        { time: { elapsed: 55 }, team: { name: "Real Madrid" }, player: { name: "Rüdiger" }, type: "Goal", detail: "Own Goal" },
      ],
    };
    const out = mapApiFootballEvents(raw, "FC Barcelona");
    expect(out.map((e) => e.type)).toEqual(["goal", "goal"]);
  });

  it("drops VAR and other unknown event types", () => {
    const raw = {
      response: [
        { time: { elapsed: 50 }, team: { name: "FC Barcelona" }, player: { name: "—" }, type: "Var", detail: "Goal cancelled" },
      ],
    };
    expect(mapApiFootballEvents(raw, "FC Barcelona")).toEqual([]);
  });

  it("matches home team via normalization across providers", () => {
    // Upstream A: 'FC Barcelona' (football-data.org). Upstream B: 'Barcelona' (api-football).
    const raw = {
      response: [
        { time: { elapsed: 30 }, team: { name: "Barcelona" }, player: { name: "Yamal" }, type: "Goal", detail: "Normal Goal" },
      ],
    };
    const out = mapApiFootballEvents(raw, "FC Barcelona");
    expect(out[0].team).toBe("home");
  });
});

describe("normalizeTeamName", () => {
  it("strips diacritics, prefixes, and case", () => {
    expect(normalizeTeamName("FC Barcelona")).toBe("barcelona");
    expect(normalizeTeamName("Atlético Madrid")).toBe("atletico madrid");
    expect(normalizeTeamName("CF Real Madrid")).toBe("real madrid");
  });
});
