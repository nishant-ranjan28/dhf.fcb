import type { FeaturedPlayer } from "@/data/fifa-featured";

export function TopScorers({ players }: { players: FeaturedPlayer[] }) {
  if (players.length === 0) return null;
  const ranked = [...players].sort((a, b) => b.goals - a.goals || b.assists - a.assists);

  return (
    <div className="flex gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {ranked.map((p, i) => (
        <div
          key={p.name}
          className="shrink-0 w-[150px] rounded-xl border border-ink-line bg-ink-soft p-3"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xl" aria-hidden>{p.flag}</span>
            <span className="text-[10px] font-mono text-ink-muted">#{i + 1}</span>
          </div>
          <p className="text-sm font-semibold text-white truncate">{p.name}</p>
          <p className="text-[11px] text-ink-muted truncate mb-2">{p.team}</p>
          <div className="flex items-center gap-3 text-[11px]">
            <span className="text-white">
              <span className="font-bold text-barca-gold">{p.goals}</span> G
            </span>
            <span className="text-white">
              <span className="font-bold text-fifa-purple">{p.assists}</span> A
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
