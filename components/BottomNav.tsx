import Link from "next/link";

const items = [
  { href: "/", label: "Home", icon: "⌂" },
  { href: "/barca", label: "Barca", icon: "⚽" },
  { href: "/live", label: "Live", icon: "●" },
  { href: "/fifa", label: "FIFA", icon: "★" },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-ink/95 backdrop-blur border-t border-ink-line">
      <ul className="mx-auto max-w-screen grid grid-cols-4">
        {items.map((it) => (
          <li key={it.href}>
            <Link
              href={it.href}
              className="flex flex-col items-center justify-center h-14 text-ink-muted hover:text-white"
            >
              <span className="text-base leading-none" aria-hidden>
                {it.icon}
              </span>
              <span className="text-[11px] mt-1">{it.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
