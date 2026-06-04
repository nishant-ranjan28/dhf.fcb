"use client";

import { useState } from "react";
import type { Highlight } from "@/lib/highlights/store";

/**
 * A horizontal reel of YouTube highlights. We render a lightweight thumbnail +
 * play button and only swap in the real <iframe> on click — loading N embeds
 * upfront would tank the page's performance.
 */
export function HighlightsReel({ highlights }: { highlights: Highlight[] }) {
  const [active, setActive] = useState<string | null>(null);
  if (highlights.length === 0) return null;

  return (
    <div className="flex gap-3 overflow-x-auto px-4 pb-2 snap-x snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      {highlights.map((h) => (
        <div key={h.youtubeId} className="snap-start shrink-0 w-[280px]">
          <div className="relative aspect-video rounded-xl overflow-hidden bg-ink-soft border border-ink-line">
            {active === h.youtubeId ? (
              <iframe
                src={`https://www.youtube.com/embed/${h.youtubeId}?autoplay=1&rel=0`}
                title={h.title}
                className="absolute inset-0 h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <button
                type="button"
                onClick={() => setActive(h.youtubeId)}
                className="group absolute inset-0 h-full w-full"
                aria-label={`Play: ${h.title}`}
              >
                <img
                  src={`https://i.ytimg.com/vi/${h.youtubeId}/hqdefault.jpg`}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
                <span className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition" />
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-live/90 text-white shadow-lg group-active:scale-95 transition">
                    <svg viewBox="0 0 24 24" className="h-6 w-6 translate-x-0.5" fill="currentColor">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </span>
                </span>
              </button>
            )}
          </div>
          <p className="text-xs text-white mt-2 line-clamp-2 leading-snug">{h.title}</p>
        </div>
      ))}
    </div>
  );
}
