"use client";

import { useEffect, useState } from "react";

/**
 * Renders a timestamp in the viewer's local timezone/locale. The server can't
 * know the viewer's zone, so we render a stable UTC fallback first and swap to
 * local on mount — suppressHydrationWarning absorbs the expected text diff.
 */
export function LocalDateTime({
  iso,
  mode = "datetime",
}: {
  iso: string;
  mode?: "datetime" | "date" | "time";
}) {
  const [local, setLocal] = useState<string | null>(null);

  useEffect(() => {
    const d = new Date(iso);
    const opts: Intl.DateTimeFormatOptions =
      mode === "date"
        ? { weekday: "short", day: "numeric", month: "short", year: "numeric" }
        : mode === "time"
          ? { hour: "2-digit", minute: "2-digit", timeZoneName: "short" }
          : {
              weekday: "short",
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            };
    setLocal(d.toLocaleString([], opts));
  }, [iso, mode]);

  const fallback = new Date(iso).toISOString().slice(0, 16).replace("T", " ") + " UTC";

  return <span suppressHydrationWarning>{local ?? fallback}</span>;
}
