import Link from "next/link";

const tabs = [
  { href: "/", label: "Home" },
  { href: "/barca", label: "Barca" },
  { href: "/fifa", label: "FIFA" },
  { href: "/live", label: "Live" },
  { href: "/blog", label: "Blog" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-40 bg-ink/95 backdrop-blur border-b border-ink-line">
      <div className="mx-auto max-w-screen px-4 h-12 flex items-center gap-4">
        <Link href="/" className="font-extrabold tracking-tight text-white">
          <span className="text-barca-blue">Barca</span>
          <span className="text-barca-red">Pulse</span>
        </Link>
        <nav className="ml-auto flex items-center gap-1 text-sm">
          {tabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="px-2.5 py-1 rounded-md text-ink-muted hover:text-white hover:bg-ink-soft"
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
