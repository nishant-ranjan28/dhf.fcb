"use client";

import { useState } from "react";
import type { GroupStanding } from "@/lib/standings";

export function StandingsTable({ groups }: { groups: GroupStanding[] }) {
  const [active, setActive] = useState(0);
  if (groups.length === 0) return null;
  const group = groups[active] ?? groups[0];

  return (
    <div>
      {groups.length > 1 && (
        <div className="flex gap-2 px-4 mb-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {groups.map((g, i) => (
            <button
              key={g.group}
              type="button"
              onClick={() => setActive(i)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                i === active
                  ? "bg-fifa-purple text-white"
                  : "bg-ink-soft text-ink-muted ring-1 ring-ink-line hover:text-white"
              }`}
            >
              {g.group.replace(/^Group\s+/i, "")}
            </button>
          ))}
        </div>
      )}

      <div className="mx-4 rounded-xl border border-ink-line bg-ink-soft overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-ink-muted border-b border-ink-line">
              <th className="text-left font-medium py-2 pl-3">{group.group}</th>
              <th className="w-7 text-center font-medium">P</th>
              <th className="w-7 text-center font-medium">W</th>
              <th className="w-7 text-center font-medium">D</th>
              <th className="w-7 text-center font-medium">L</th>
              <th className="w-9 text-center font-medium">GD</th>
              <th className="w-9 text-center font-medium pr-3">Pts</th>
            </tr>
          </thead>
          <tbody>
            {group.rows.map((r, i) => (
              <tr
                key={r.team}
                className={`border-b border-ink-line/60 last:border-0 ${
                  i < 2 ? "bg-fifa-purple/5" : ""
                }`}
              >
                <td className="py-2 pl-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-4 text-center text-[11px] font-mono ${
                        i < 2 ? "text-fifa-purple" : "text-ink-muted"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span className="text-white truncate">{r.team}</span>
                  </div>
                </td>
                <td className="text-center text-ink-muted tabular-nums">{r.played}</td>
                <td className="text-center text-ink-muted tabular-nums">{r.won}</td>
                <td className="text-center text-ink-muted tabular-nums">{r.drawn}</td>
                <td className="text-center text-ink-muted tabular-nums">{r.lost}</td>
                <td className="text-center text-ink-muted tabular-nums">
                  {r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff}
                </td>
                <td className="text-center font-bold text-white tabular-nums pr-3">{r.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-ink-muted px-4 mt-2">Top 2 advance · updates as results come in</p>
    </div>
  );
}
