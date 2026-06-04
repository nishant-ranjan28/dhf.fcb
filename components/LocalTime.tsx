"use client";

import { useEffect, useState } from "react";

export type LocalTimePreset = "time" | "date" | "datetime" | "datetime-tz";

const PRESETS: Record<LocalTimePreset, Intl.DateTimeFormatOptions> = {
  time: { hour: "2-digit", minute: "2-digit" },
  date: { weekday: "short", day: "numeric", month: "short", year: "numeric" },
  datetime: { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" },
  "datetime-tz": { hour: "2-digit", minute: "2-digit", timeZoneName: "short" },
};

/**
 * Deterministic UTC fallback used for the server render AND the client's first
 * paint. It must NOT use locale formatting — `toISOString()` is identical on
 * the (UTC) server and the browser, so the two passes agree and there's no
 * hydration mismatch. The viewer's real local time is filled in after mount.
 */
export function _utcFallback(iso: string, preset: LocalTimePreset): string {
  const z = new Date(iso).toISOString(); // e.g. "2026-06-19T06:30:00.000Z"
  const date = z.slice(0, 10);
  const time = z.slice(11, 16);
  switch (preset) {
    case "date":
      return date;
    case "datetime":
    case "datetime-tz":
      return `${date} ${time} UTC`;
    case "time":
    default:
      return `${time} UTC`;
  }
}

/**
 * Render an ISO timestamp in the viewer's local timezone/locale. The server
 * can't know the viewer's zone, so we render a stable UTC fallback first and
 * swap to local on mount — this both fixes the Node-vs-browser hydration
 * mismatch and actually shows the user their own local time.
 */
export function LocalTime({
  iso,
  preset = "time",
  className,
}: {
  iso: string;
  preset?: LocalTimePreset;
  className?: string;
}) {
  const [local, setLocal] = useState<string | null>(null);

  useEffect(() => {
    setLocal(new Date(iso).toLocaleString([], PRESETS[preset]));
  }, [iso, preset]);

  return (
    <span className={className} suppressHydrationWarning>
      {local ?? _utcFallback(iso, preset)}
    </span>
  );
}
