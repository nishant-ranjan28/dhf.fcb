import Link from "next/link";

type Accent = "blue" | "red" | "purple" | "gold" | "live";

const ACCENT_BAR: Record<Accent, string> = {
  blue: "bg-barca-blue",
  red: "bg-barca-red",
  purple: "bg-fifa-purple",
  gold: "bg-barca-gold",
  live: "bg-live",
};

export function SectionTitle({
  title,
  href,
  rightLabel = "See all",
  accent,
}: {
  title: string;
  href?: string;
  rightLabel?: string;
  /** Optional colored leading bar. Omit to keep the plain heading (default). */
  accent?: Accent;
}) {
  return (
    <div className="flex items-baseline justify-between mt-6 mb-2 px-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-white uppercase">
        {accent && (
          <span className={`h-3.5 w-1 rounded-full ${ACCENT_BAR[accent]}`} aria-hidden />
        )}
        {title}
      </h2>
      {href && (
        <Link href={href} className="text-xs text-ink-muted hover:text-white">
          {rightLabel} →
        </Link>
      )}
    </div>
  );
}
