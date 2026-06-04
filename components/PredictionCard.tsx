"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Match } from "@/lib/types";
import type { Prediction } from "@/lib/predictions/store";
import { getDeviceId, getPlayerName, setPlayerName } from "./predictions/player";

interface Summary {
  count: number;
  topScore: string | null;
  topCount: number;
}

const OUTCOME_LABEL: Record<string, string> = {
  exact: "Exact score!",
  result: "Right result",
  miss: "Missed",
};

function Stepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[11px] text-ink-muted truncate max-w-[7rem]">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          className="h-7 w-7 rounded-full bg-ink ring-1 ring-ink-line text-white text-lg leading-none active:scale-95"
          aria-label={`decrease ${label}`}
        >
          −
        </button>
        <span className="w-7 text-center font-mono text-2xl tabular-nums text-white">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(20, value + 1))}
          className="h-7 w-7 rounded-full bg-ink ring-1 ring-ink-line text-white text-lg leading-none active:scale-95"
          aria-label={`increase ${label}`}
        >
          +
        </button>
      </div>
    </div>
  );
}

export function PredictionCard({ match }: { match: Match }) {
  const open = match.status === "SCHED";
  const settled = match.status === "FT";

  const [loading, setLoading] = useState(true);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [home, setHome] = useState(1);
  const [away, setAway] = useState(1);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(getPlayerName());
    fetch(`/api/predictions?slug=${encodeURIComponent(match.slug)}&deviceId=${encodeURIComponent(getDeviceId())}`)
      .then((r) => r.json())
      .then((j: { prediction: Prediction | null; summary: Summary }) => {
        setPrediction(j.prediction);
        setSummary(j.summary);
        if (j.prediction) {
          setHome(j.prediction.home);
          setAway(j.prediction.away);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [match.slug]);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      if (name.trim()) setPlayerName(name);
      const res = await fetch("/api/predictions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug: match.slug,
          deviceId: getDeviceId(),
          name: name.trim() || "Anon",
          home,
          away,
        }),
      });
      const j = (await res.json()) as { prediction?: Prediction; error?: string };
      if (!res.ok || !j.prediction) {
        setError(j.error ?? `HTTP ${res.status}`);
        return;
      }
      setPrediction(j.prediction);
      setEditing(false);
    } catch {
      setError("Could not save — try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="px-4 mt-4">
        <div className="h-28 rounded-2xl bg-ink-soft border border-ink-line animate-pulse" />
      </section>
    );
  }

  const showForm = open && (editing || !prediction);

  return (
    <section className="px-4 mt-4">
      <div className="rounded-2xl border border-ink-line bg-gradient-to-br from-fifa-purple/15 via-ink-soft to-ink p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="flex items-center gap-2 text-sm font-bold text-white">
            <span aria-hidden>🔮</span> Predict the score
          </h2>
          <Link href="/predictions" className="text-[11px] text-fifa-purple hover:text-white">
            Leaderboard →
          </Link>
        </div>

        {showForm ? (
          <>
            <div className="flex items-center justify-center gap-4">
              <Stepper label={match.home.name} value={home} onChange={setHome} />
              <span className="text-ink-muted font-mono pt-5">–</span>
              <Stepper label={match.away.name} value={away} onChange={setAway} />
            </div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name for the leaderboard"
              maxLength={24}
              className="mt-3 w-full bg-ink border border-ink-line rounded-lg px-3 py-2 text-sm text-white placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-fifa-purple"
            />
            {error && <p className="mt-2 text-[11px] text-live">{error}</p>}
            <button
              type="button"
              onClick={submit}
              disabled={saving}
              className="mt-3 w-full rounded-lg bg-fifa-purple px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 active:scale-[0.99]"
            >
              {saving ? "Saving…" : prediction ? "Update prediction" : "Submit prediction"}
            </button>
          </>
        ) : (
          <>
            {prediction ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-ink-muted">Your prediction</p>
                  <p className="font-mono text-2xl tabular-nums text-white">
                    {prediction.home} – {prediction.away}
                  </p>
                </div>
                {settled && prediction.outcome ? (
                  <div className="text-right">
                    <p
                      className={`text-sm font-bold ${
                        prediction.outcome === "miss" ? "text-ink-muted" : "text-barca-gold"
                      }`}
                    >
                      +{prediction.points ?? 0} pts
                    </p>
                    <p className="text-[11px] text-ink-muted">{OUTCOME_LABEL[prediction.outcome]}</p>
                  </div>
                ) : open ? (
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="text-[11px] rounded px-2 py-1 ring-1 ring-ink-line text-ink-muted hover:text-white"
                  >
                    Edit
                  </button>
                ) : (
                  <span className="text-[11px] text-ink-muted">Locked</span>
                )}
              </div>
            ) : (
              <p className="text-sm text-ink-muted">
                {settled ? "You didn't predict this match." : "Predictions are closed for this match."}
              </p>
            )}
          </>
        )}

        {summary && summary.count > 0 && (
          <p className="mt-3 text-[11px] text-ink-muted">
            {summary.count} prediction{summary.count === 1 ? "" : "s"}
            {summary.topScore && (
              <>
                {" · "}most-tipped <span className="text-white font-mono">{summary.topScore}</span>
              </>
            )}
          </p>
        )}
      </div>
    </section>
  );
}
