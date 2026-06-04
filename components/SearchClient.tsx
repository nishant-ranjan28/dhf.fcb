"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { SearchHit, SearchResults } from "@/lib/search";

const EMPTY: SearchResults = { matches: [], news: [], blog: [] };

function HitRow({ hit }: { hit: SearchHit }) {
  const inner = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-white">{hit.title}</span>
        {hit.subtitle && <span className="block truncate text-[11px] text-ink-muted">{hit.subtitle}</span>}
      </span>
      <span className="flex-none text-ink-muted" aria-hidden>{hit.external ? "↗" : "→"}</span>
    </>
  );
  const cls = "flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 transition";
  return hit.external ? (
    <a href={hit.href} target="_blank" rel="noopener noreferrer" className={cls}>
      {inner}
    </a>
  ) : (
    <Link href={hit.href} className={cls}>
      {inner}
    </Link>
  );
}

function Group({ label, hits, accent }: { label: string; hits: SearchHit[]; accent: string }) {
  if (hits.length === 0) return null;
  return (
    <div className="mt-4">
      <h2 className="flex items-center gap-2 px-1 mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
        <span className={`h-3.5 w-1 rounded-full ${accent}`} aria-hidden />
        {label}
      </h2>
      <div className="rounded-xl border border-ink-line bg-ink-soft divide-y divide-ink-line overflow-hidden">
        {hits.map((h, i) => (
          <HitRow key={`${h.href}-${i}`} hit={h} />
        ))}
      </div>
    </div>
  );
}

export function SearchClient() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults(EMPTY);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((j: SearchResults) => setResults(j))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const total = results.matches.length + results.news.length + results.blog.length;
  const hasQuery = q.trim().length >= 2;

  return (
    <div className="px-4 mt-4">
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search teams, matches, news, blog…"
        className="w-full bg-ink-soft border border-ink-line rounded-xl px-4 py-3 text-sm text-white placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-barca-blue"
      />

      {!hasQuery && (
        <p className="mt-6 text-center text-sm text-ink-muted">
          Type at least 2 characters to search.
        </p>
      )}

      {hasQuery && !loading && total === 0 && (
        <p className="mt-6 text-center text-sm text-ink-muted">
          No results for “{q.trim()}”.
        </p>
      )}

      <Group label="Matches" hits={results.matches} accent="bg-fifa-purple" />
      <Group label="News" hits={results.news} accent="bg-barca-blue" />
      <Group label="Blog" hits={results.blog} accent="bg-barca-gold" />
    </div>
  );
}
