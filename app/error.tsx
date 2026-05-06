"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app/error]", error);
  }, [error]);

  return (
    <div className="px-4 py-20 text-center">
      <h1 className="text-2xl font-bold text-white">Something went wrong</h1>
      <p className="mt-2 text-sm text-ink-muted">
        We hit a problem loading this page. Please try again.
      </p>
      {error.digest && (
        <p className="mt-1 text-[11px] text-ink-muted/70">ref: {error.digest}</p>
      )}
      <div className="mt-6 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="px-3 py-1.5 rounded-md bg-barca-blue text-white text-sm font-semibold"
        >
          Retry
        </button>
        <Link href="/" className="text-sm text-barca-gold">
          ← Home
        </Link>
      </div>
    </div>
  );
}
