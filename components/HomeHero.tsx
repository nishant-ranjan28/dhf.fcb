import Link from "next/link";

const chips = [
  { href: "/barca", label: "⚽ Barça" },
  { href: "/fifa", label: "🏆 World Cup" },
  { href: "/live", label: "🔴 Live" },
  { href: "/blog", label: "✍️ Blog" },
];

export function HomeHero() {
  return (
    <section className="px-4 mt-3">
      <div className="relative overflow-hidden rounded-2xl p-6">
        {/* Animated brand-colour gradient backdrop */}
        <div
          className="absolute inset-0 animate-gradient bg-gradient-to-br from-barca-blue via-barca-red to-fifa-purple"
          aria-hidden
        />
        {/* Darkening scrim so white text stays legible over the bright stops */}
        <div className="absolute inset-0 bg-ink/30" aria-hidden />
        {/* Soft glow accents */}
        <div
          className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-barca-gold/30 blur-2xl"
          aria-hidden
        />

        <div className="relative">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/80">
            Your matchday companion
          </p>
          <h1 className="mt-2 text-3xl font-extrabold leading-tight text-white drop-shadow">
            Every goal. Every match.
            <br />
            <span className="text-barca-gold">Live.</span>
          </h1>
          <p className="mt-2 max-w-[34ch] text-sm text-white/85">
            Live scores, lineups, momentum and news — FC Barcelona and the FIFA
            World Cup, in real time.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {chips.map((c) => (
              <Link
                key={c.href}
                href={c.href}
                className="rounded-full bg-white/15 px-3.5 py-1.5 text-sm font-semibold text-white ring-1 ring-white/25 backdrop-blur transition hover:bg-white/25 active:scale-95"
              >
                {c.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
