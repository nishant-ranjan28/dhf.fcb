"use client";

import { useState } from "react";
import type { Highlight } from "@/lib/highlights/store";
import { SendToTelegramButton } from "@/components/SendToTelegramButton";

export function HighlightsManager({
  initial,
  telegramConfigured = false,
}: {
  initial: Highlight[];
  telegramConfigured?: boolean;
}) {
  const [items, setItems] = useState<Highlight[]>(initial);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/highlights", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, title }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        highlight?: Highlight;
        error?: string;
      };
      if (!res.ok || !json.highlight) {
        setError(json.error ?? `HTTP ${res.status}`);
        return;
      }
      setItems((prev) => [json.highlight!, ...prev.filter((h) => h.youtubeId !== json.highlight!.youtubeId)]);
      setUrl("");
      setTitle("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "add failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(youtubeId: string) {
    const prev = items;
    setItems((p) => p.filter((h) => h.youtubeId !== youtubeId));
    const res = await fetch(`/api/highlights?id=${encodeURIComponent(youtubeId)}`, {
      method: "DELETE",
    });
    if (!res.ok) setItems(prev); // rollback on failure
  }

  return (
    <div className="space-y-5">
      <form onSubmit={add} className="space-y-2 bg-ink-soft border border-ink-line rounded-xl p-3">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="YouTube URL or video id"
          required
          className="w-full bg-ink border border-ink-line rounded-lg px-3 py-2 text-sm text-white placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-fifa-purple"
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title, e.g. Argentina 3-2 Brazil — all goals"
          required
          className="w-full bg-ink border border-ink-line rounded-lg px-3 py-2 text-sm text-white placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-fifa-purple"
        />
        <div className="flex items-center justify-between">
          {error ? (
            <span className="text-[11px] text-live">{error}</span>
          ) : (
            <span className="text-[11px] text-ink-muted">{items.length} highlight{items.length === 1 ? "" : "s"}</span>
          )}
          <button
            type="submit"
            disabled={busy}
            className="text-sm font-semibold rounded-lg px-4 py-2 bg-fifa-purple text-white disabled:opacity-50"
          >
            {busy ? "Adding…" : "Add highlight"}
          </button>
        </div>
      </form>

      <ul className="space-y-2">
        {items.map((h) => (
          <li
            key={h.youtubeId}
            className="flex items-center gap-3 bg-ink-soft border border-ink-line rounded-xl p-2"
          >
            <img
              src={`https://i.ytimg.com/vi/${h.youtubeId}/mqdefault.jpg`}
              alt=""
              className="h-12 w-20 rounded object-cover flex-none"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-white truncate">{h.title}</p>
              <p className="text-[11px] text-ink-muted truncate">{h.youtubeId}</p>
            </div>
            {telegramConfigured && (
              <SendToTelegramButton
                payload={{ kind: "highlight", title: h.title, youtubeId: h.youtubeId }}
                label="Send to TG"
                className="flex-none"
              />
            )}
            <button
              type="button"
              onClick={() => remove(h.youtubeId)}
              className="text-[11px] rounded px-2 py-1 ring-1 ring-ink-line text-ink-muted hover:text-live hover:ring-live/60 transition flex-none"
            >
              Remove
            </button>
          </li>
        ))}
        {items.length === 0 && (
          <li className="text-[12px] text-ink-muted text-center py-6">
            No highlights yet. Add one above.
          </li>
        )}
      </ul>
    </div>
  );
}
