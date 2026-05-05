import Link from "next/link";

export default function NotFound() {
  return (
    <div className="px-4 py-20 text-center">
      <h1 className="text-2xl font-bold text-white">Not found</h1>
      <p className="mt-2 text-sm text-ink-muted">
        That page doesn&apos;t exist or the match is over.
      </p>
      <Link href="/" className="inline-block mt-6 text-sm text-barca-gold">
        ← Back to home
      </Link>
    </div>
  );
}
