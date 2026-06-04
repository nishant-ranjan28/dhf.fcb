"use client";

import { useEffect, useState } from "react";
import type { MatchInsights as Insights } from "@/lib/ai/groq";

type State =
  | { phase: "loading" }
  | { phase: "ready"; insights: Insights }
  | { phase: "empty" };

/**
 * AI-generated match preview/recap + trivia, fetched client-side so it never
 * blocks the page. `stateKey` (score/events) changes during a live match and
 * re-triggers the fetch so the recap stays current.
 */
export function MatchInsights({ slug, stateKey }: { slug: string; stateKey: string }) {
  const [state, setState] = useState<State>({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ phase: "loading" });
    fetch(`/api/match/${slug}/insights`)
      .then((r) => r.json())
      .then((j: { insights: Insights | null }) => {
        if (cancelled) return;
        const ins = j.insights;
        const hasContent = ins && (ins.trivia.length > 0 || ins.blurb || ins.headline);
        setState(hasContent ? { phase: "ready", insights: ins! } : { phase: "empty" });
      })
      .catch(() => !cancelled && setState({ phase: "empty" }));
    return () => {
      cancelled = true;
    };
  }, [slug, stateKey]);

  if (state.phase === "empty") return null;

  return (
    <section className="px-4 mt-4">
      <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-muted mb-2 px-1">
        <span aria-hidden>✨</span> Match insight
        <span className="text-[9px] font-normal normal-case tracking-normal text-ink-muted/70">
          AI-generated
        </span>
      </h2>

      {state.phase === "loading" ? (
        <div className="rounded-xl bg-ink-soft border border-ink-line p-4 space-y-2 animate-pulse">
          <div className="h-3 w-2/3 rounded bg-ink-line" />
          <div className="h-3 w-full rounded bg-ink-line" />
          <div className="h-3 w-5/6 rounded bg-ink-line" />
        </div>
      ) : (
        <div className="rounded-xl bg-gradient-to-br from-fifa-purple/15 via-ink-soft to-ink border border-ink-line p-4">
          {state.insights.headline && (
            <p className="text-sm font-bold text-white mb-1">{state.insights.headline}</p>
          )}
          {state.insights.blurb && (
            <p className="text-[13px] text-ink-muted leading-relaxed">{state.insights.blurb}</p>
          )}

          {state.insights.trivia.length > 0 && (
            <ul className="mt-3 space-y-2">
              {state.insights.trivia.map((fact, i) => (
                <li key={i} className="flex gap-2 text-[13px] text-white">
                  <span className="text-fifa-purple flex-none" aria-hidden>
                    💡
                  </span>
                  <span className="leading-snug">{fact}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
