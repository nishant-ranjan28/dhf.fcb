"use client";

import { useMemo } from "react";
import {
  orderByViewerRegion,
  regionFromLocale,
  type Broadcaster,
} from "@/data/broadcasters";

export function WhereToWatch({ broadcasters }: { broadcasters: Broadcaster[] }) {
  // navigator.language is only available on the client; useMemo runs once the
  // component renders in the browser, so the viewer's region floats to the top.
  const ordered = useMemo(() => {
    const locale = typeof navigator !== "undefined" ? navigator.language : undefined;
    return orderByViewerRegion(broadcasters, regionFromLocale(locale));
  }, [broadcasters]);

  if (ordered.length === 0) return null;

  return (
    <section className="px-4 mt-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-2 px-1">
        Where to watch
      </h2>
      <ul className="rounded-xl bg-ink-soft border border-ink-line divide-y divide-ink-line">
        {ordered.map((b, i) => (
          <li key={b.code}>
            <a
              href={b.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 transition"
            >
              <span className="text-lg" aria-hidden>{b.flag ?? "📺"}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white truncate">{b.name}</p>
                <p className="text-[11px] text-ink-muted truncate">{b.region}</p>
              </div>
              {i === 0 && (
                <span className="text-[10px] font-semibold uppercase tracking-wide text-fifa-purple flex-none">
                  Your region
                </span>
              )}
              <span className="text-ink-muted flex-none" aria-hidden>↗</span>
            </a>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-ink-muted px-1 mt-2">
        Official rights-holders shown. Coverage varies by territory — check your local listings.
      </p>
    </section>
  );
}
