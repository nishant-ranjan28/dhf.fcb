import { describe, it, expect } from "vitest";
import { _utcFallback } from "@/components/LocalTime";

// The fallback is rendered on BOTH the server and the client's first paint, so
// it must be deterministic (UTC, no locale formatting) to avoid a hydration
// mismatch. These tests pin that contract.
describe("_utcFallback", () => {
  const iso = "2026-06-19T06:30:00.000Z";

  it("formats time-only as HH:MM UTC", () => {
    expect(_utcFallback(iso, "time")).toBe("06:30 UTC");
  });

  it("formats date-only as YYYY-MM-DD", () => {
    expect(_utcFallback(iso, "date")).toBe("2026-06-19");
  });

  it("formats datetime as date + time UTC", () => {
    expect(_utcFallback(iso, "datetime")).toBe("2026-06-19 06:30 UTC");
    expect(_utcFallback(iso, "datetime-tz")).toBe("2026-06-19 06:30 UTC");
  });

  it("normalizes a non-UTC offset to UTC (deterministic across runtimes)", () => {
    // 06:30 at UTC-6 is 12:30 UTC — the fallback always reports UTC.
    expect(_utcFallback("2026-06-19T06:30:00-06:00", "time")).toBe("12:30 UTC");
  });

  it("is a pure function of its input (same output every call)", () => {
    expect(_utcFallback(iso, "time")).toBe(_utcFallback(iso, "time"));
  });
});
