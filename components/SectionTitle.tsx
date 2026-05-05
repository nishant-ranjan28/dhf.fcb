import Link from "next/link";

export function SectionTitle({
  title,
  href,
  rightLabel = "See all",
}: {
  title: string;
  href?: string;
  rightLabel?: string;
}) {
  return (
    <div className="flex items-baseline justify-between mt-6 mb-2 px-4">
      <h2 className="text-sm font-semibold tracking-wide text-white uppercase">{title}</h2>
      {href && (
        <Link href={href} className="text-xs text-ink-muted hover:text-white">
          {rightLabel} →
        </Link>
      )}
    </div>
  );
}
