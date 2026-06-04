"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Match } from "@/lib/types";

function diffParts(ms: number) {
  const clamp = Math.max(0, ms);
  const totalSec = Math.floor(clamp / 1000);
  return {
    days: Math.floor(totalSec / 86_400),
    hours: Math.floor((totalSec % 86_400) / 3600),
    minutes: Math.floor((totalSec % 3600) / 60),
    seconds: totalSec % 60,
    done: ms <= 0,
  };
}

function Cell({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="font-mono tabular-nums text-2xl font-bold text-white leading-none">
        {String(value).padStart(2, "0")}
      </span>
      <span className="text-[10px] uppercase tracking-wider text-white/60 mt-1">{label}</span>
    </div>
  );
}

export function CountdownTimer({ match }: { match: Match }) {
  // Render nothing time-sensitive on the server pass — compute after mount to
  // avoid a hydration mismatch on the ticking values.
  const [parts, setParts] = useState<ReturnType<typeof diffParts> | null>(null);

  useEffect(() => {
    const target = +new Date(match.kickoff);
    const tick = () => setParts(diffParts(target - Date.now()));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [match.kickoff]);

  return (
    <Link href={`/match/${match.slug}`} className="block mx-4 mt-3">
      <div className="relative overflow-hidden rounded-2xl border border-fifa-purple/40 bg-gradient-to-br from-fifa-purple/30 via-ink-soft to-ink p-4 active:scale-[0.99] transition">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-fifa-purple">
            Next kick-off
          </span>
          <span className="text-[11px] text-white/60">{match.group ?? match.competitionName}</span>
        </div>

        <div className="flex items-center justify-center gap-3 mb-4">
          <span className="text-base font-bold text-white text-right flex-1 truncate">
            {match.home.name}
          </span>
          <span className="text-xs font-mono text-white/50 px-2">vs</span>
          <span className="text-base font-bold text-white text-left flex-1 truncate">
            {match.away.name}
          </span>
        </div>

        {parts ? (
          parts.done ? (
            <p className="text-center text-sm font-semibold text-fifa-purple">Kicking off now ⚽</p>
          ) : (
            <div className="grid grid-cols-4 gap-2 max-w-[280px] mx-auto">
              <Cell value={parts.days} label="days" />
              <Cell value={parts.hours} label="hrs" />
              <Cell value={parts.minutes} label="min" />
              <Cell value={parts.seconds} label="sec" />
            </div>
          )
        ) : (
          // Pre-mount skeleton — locale-independent so SSR and the first client
          // paint agree (the live values fill in once the effect runs).
          <div className="grid grid-cols-4 gap-2 max-w-[280px] mx-auto">
            <Cell value={0} label="days" />
            <Cell value={0} label="hrs" />
            <Cell value={0} label="min" />
            <Cell value={0} label="sec" />
          </div>
        )}
      </div>
    </Link>
  );
}
