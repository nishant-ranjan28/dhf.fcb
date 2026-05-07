"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const from = search.get("from") || "/admin/blog";

  const [token, setToken] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        setError(res.status === 401 ? "Wrong token." : "Login failed.");
        setPending(false);
        return;
      }
      router.replace(from);
      router.refresh();
    } catch {
      setError("Network error.");
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-ink-soft border border-ink-line rounded-xl p-5 space-y-3">
        <div>
          <h1 className="text-lg font-bold text-white">Admin sign-in</h1>
          <p className="text-[12px] text-ink-muted mt-1">
            Paste your <code>ADMIN_TOKEN</code> to manage blog posts.
          </p>
        </div>
        <input
          type="password"
          autoFocus
          required
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Admin token"
          className="w-full bg-ink border border-ink-line rounded-md px-3 py-2 text-sm text-white placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-barca-blue"
        />
        {error && <p className="text-[12px] text-live">{error}</p>}
        <button
          type="submit"
          disabled={pending || !token}
          className="w-full rounded-md bg-barca-blue text-white text-sm font-semibold py-2 disabled:opacity-50"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
