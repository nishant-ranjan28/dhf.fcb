"use client";

import { useEffect, useState } from "react";
import type { Poll } from "@/lib/poll/polls";

interface Tally {
  counts: Record<string, number>;
  total: number;
}

const VOTED_KEY = (id: string) => `poll:${id}:choice`;
const VOTER_KEY = "poll:voterId";

/** Stable per-device id, generated once and kept in localStorage. */
function getVoterId(): string {
  let id = localStorage.getItem(VOTER_KEY);
  if (!id) {
    id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `v-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
    localStorage.setItem(VOTER_KEY, id);
  }
  return id;
}

export function PollCard({ poll }: { poll: Poll }) {
  const [tally, setTally] = useState<Tally | null>(null);
  const [voted, setVoted] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    setVoted(localStorage.getItem(VOTED_KEY(poll.id)));
    fetch(`/api/poll?id=${encodeURIComponent(poll.id)}`)
      .then((r) => r.json())
      .then((j: Tally) => setTally(j))
      .catch(() => setTally({ counts: {}, total: 0 }));
  }, [poll.id]);

  async function vote(optionId: string) {
    if (voted || pending) return;
    setPending(optionId);
    try {
      const res = await fetch("/api/poll", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: poll.id, option: optionId, voterId: getVoterId() }),
      });
      const json = (await res.json()) as Tally;
      if (res.ok) {
        setTally(json);
        setVoted(optionId);
        localStorage.setItem(VOTED_KEY(poll.id), optionId);
      }
    } catch {
      /* swallow — leave the poll in its current state */
    } finally {
      setPending(null);
    }
  }

  const total = tally?.total ?? 0;
  const showResults = Boolean(voted) && tally !== null;

  return (
    <section className="mx-4 mt-3 rounded-2xl border border-ink-line bg-ink-soft p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base" aria-hidden>📊</span>
        <h2 className="text-sm font-bold text-white">{poll.question}</h2>
      </div>

      <div className="space-y-2">
        {poll.options.map((opt) => {
          const count = tally?.counts[opt.id] ?? 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const mine = voted === opt.id;

          if (showResults) {
            return (
              <div
                key={opt.id}
                className={`relative overflow-hidden rounded-lg border px-3 py-2 ${
                  mine ? "border-fifa-purple" : "border-ink-line"
                }`}
              >
                <div
                  className={`absolute inset-y-0 left-0 transition-all duration-700 ease-out ${
                    mine ? "bg-fifa-purple/35" : "bg-white/10"
                  }`}
                  style={{ width: `${pct}%` }}
                />
                <div className="relative flex items-center justify-between text-sm">
                  <span className="text-white">
                    {opt.flag && <span className="mr-1.5">{opt.flag}</span>}
                    {opt.label}
                    {mine && <span className="ml-1.5 text-fifa-purple">✓</span>}
                  </span>
                  <span className="font-mono tabular-nums text-white/80">{pct}%</span>
                </div>
              </div>
            );
          }

          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => vote(opt.id)}
              disabled={pending !== null}
              className="w-full text-left rounded-lg border border-ink-line px-3 py-2 text-sm text-white hover:border-fifa-purple hover:bg-fifa-purple/10 disabled:opacity-50 transition active:scale-[0.99]"
            >
              {opt.flag && <span className="mr-1.5">{opt.flag}</span>}
              {opt.label}
            </button>
          );
        })}
      </div>

      <p className="text-[11px] text-ink-muted mt-3">
        {showResults
          ? `${total.toLocaleString()} vote${total === 1 ? "" : "s"} · thanks for voting!`
          : "Tap to cast your vote"}
      </p>
    </section>
  );
}
