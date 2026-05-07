"use client";

import { useEffect } from "react";

// Posts a single increment to /api/blog/<slug>/view on mount. Uses
// sessionStorage to dedupe within a session (refresh = no extra count;
// new tab = a new count, which is fine for vanity stats).
export function ViewBeacon({ slug }: { slug: string }) {
  useEffect(() => {
    if (!slug) return;
    const key = `bp:viewed:${slug}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // sessionStorage may be unavailable (incognito quirks) — fall through.
    }
    fetch(`/api/blog/${encodeURIComponent(slug)}/view`, {
      method: "POST",
      // sendBeacon-like — fire and forget; no body needed.
      keepalive: true,
    }).catch(() => {
      // Best-effort. View counts aren't critical.
    });
  }, [slug]);
  return null;
}
