"use client";

import { useEffect, useState } from "react";

function diffParts(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
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

/** Standalone, link-free countdown for the match page hero. */
export function KickoffCountdown({ kickoff }: { kickoff: string }) {
  const [parts, setParts] = useState<ReturnType<typeof diffParts> | null>(null);

  useEffect(() => {
    const target = +new Date(kickoff);
    const tick = () => setParts(diffParts(target - Date.now()));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [kickoff]);

  const value = parts ?? { days: 0, hours: 0, minutes: 0, seconds: 0, done: false };

  if (value.done) {
    return (
      <p className="text-center text-sm font-semibold text-fifa-purple py-2">
        Kicking off now ⚽
      </p>
    );
  }

  return (
    <div className="grid grid-cols-4 gap-2 max-w-[280px] mx-auto">
      <Cell value={value.days} label="days" />
      <Cell value={value.hours} label="hrs" />
      <Cell value={value.minutes} label="min" />
      <Cell value={value.seconds} label="sec" />
    </div>
  );
}
