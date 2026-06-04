"use client";

import { useEffect, useState } from "react";
import { getDeviceId } from "./predictions/player";

interface Entry {
  deviceId: string;
  name: string;
  points: number;
  rank: number;
}
interface Me {
  points: number;
  rank: number | null;
  name: string | null;
}

const MEDAL = ["🥇", "🥈", "🥉"];

export function PredictionLeaderboard() {
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [myId, setMyId] = useState("");

  useEffect(() => {
    const id = getDeviceId();
    setMyId(id);
    fetch(`/api/predictions/leaderboard?deviceId=${encodeURIComponent(id)}&limit=50`)
      .then((r) => r.json())
      .then((j: { leaderboard: Entry[]; me: Me | null }) => {
        setRows(j.leaderboard);
        setMe(j.me);
      })
      .catch(() => setRows([]));
  }, []);

  if (rows === null) {
    return <div className="mx-4 h-40 rounded-xl bg-ink-soft border border-ink-line animate-pulse" />;
  }

  // Show the player's own standing if they have points but fell outside top 50.
  const inList = rows.some((r) => r.deviceId === myId);
  const showMeRow = me && me.rank !== null && !inList;

  if (rows.length === 0) {
    return (
      <div className="mx-4 rounded-xl bg-ink-soft border border-ink-line p-6 text-center text-sm text-ink-muted">
        No predictions scored yet. Be the first — head to a match and call the score!
      </div>
    );
  }

  return (
    <div className="mx-4 rounded-xl border border-ink-line bg-ink-soft overflow-hidden">
      <ul className="divide-y divide-ink-line">
        {rows.map((r) => {
          const mine = r.deviceId === myId;
          return (
            <li
              key={r.deviceId}
              className={`flex items-center gap-3 px-3 py-2.5 ${mine ? "bg-fifa-purple/10" : ""}`}
            >
              <span className="w-7 text-center text-sm font-mono text-ink-muted">
                {r.rank <= 3 ? MEDAL[r.rank - 1] : r.rank}
              </span>
              <span className="flex-1 truncate text-sm text-white">
                {r.name}
                {mine && <span className="ml-1.5 text-[10px] text-fifa-purple">you</span>}
              </span>
              <span className="font-mono tabular-nums text-sm font-bold text-white">{r.points}</span>
            </li>
          );
        })}
      </ul>
      {showMeRow && (
        <div className="flex items-center gap-3 px-3 py-2.5 bg-fifa-purple/10 border-t border-ink-line">
          <span className="w-7 text-center text-sm font-mono text-ink-muted">{me!.rank}</span>
          <span className="flex-1 truncate text-sm text-white">
            {me!.name ?? "You"}
            <span className="ml-1.5 text-[10px] text-fifa-purple">you</span>
          </span>
          <span className="font-mono tabular-nums text-sm font-bold text-white">{me!.points}</span>
        </div>
      )}
    </div>
  );
}
