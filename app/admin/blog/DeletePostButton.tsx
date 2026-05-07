"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeletePostButton({ slug }: { slug: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    if (!confirm(`Delete "${slug}"? This can't be undone.`)) return;
    setPending(true);
    try {
      const res = await fetch(`/api/blog/${slug}`, { method: "DELETE" });
      if (!res.ok) {
        alert(`Delete failed (${res.status})`);
        setPending(false);
        return;
      }
      router.refresh();
    } catch {
      alert("Delete failed (network)");
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={pending}
      className="text-[11px] text-ink-muted hover:text-live border border-ink-line hover:border-live rounded px-2 py-1 disabled:opacity-50"
    >
      {pending ? "…" : "Delete"}
    </button>
  );
}
