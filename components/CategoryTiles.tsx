import Link from "next/link";

const tiles = [
  {
    href: "/barca",
    title: "FC Barcelona",
    sub: "News · scores · lineups",
    emoji: "🔵🔴",
    gradient: "from-barca-blue to-barca-red",
  },
  {
    href: "/fifa",
    title: "World Cup 2026",
    sub: "Fixtures · groups · polls",
    emoji: "🏆",
    gradient: "from-fifa-purple to-barca-blue",
  },
  {
    href: "/live",
    title: "Live Scores",
    sub: "Goals as they happen",
    emoji: "🔴",
    gradient: "from-live to-barca-red",
  },
] as const;

export function CategoryTiles() {
  return (
    <div className="px-4 mt-4 grid grid-cols-3 gap-2">
      {tiles.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`group relative overflow-hidden rounded-xl bg-gradient-to-br ${t.gradient} p-3 min-h-[92px] flex flex-col justify-between active:scale-[0.98] transition`}
        >
          <span className="text-lg leading-none" aria-hidden>{t.emoji}</span>
          <span>
            <span className="block text-sm font-bold text-white leading-tight">{t.title}</span>
            <span className="block text-[10px] text-white/80 leading-tight mt-0.5">{t.sub}</span>
          </span>
          <span
            className="absolute -bottom-6 -right-4 h-16 w-16 rounded-full bg-white/15 blur-lg transition group-hover:bg-white/25"
            aria-hidden
          />
        </Link>
      ))}
    </div>
  );
}
