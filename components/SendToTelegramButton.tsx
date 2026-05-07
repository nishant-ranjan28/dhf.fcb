"use client";

import { useState } from "react";

type State = "idle" | "pending" | "ok" | "error";

type Payload =
  | { kind: "blog"; slug: string }
  | { kind: "news"; title: string; link: string; source?: string };

interface Props {
  payload: Payload;
  /** Override the default button label. */
  label?: string;
  /** Pass extra Tailwind classes for layout. */
  className?: string;
}

export function SendToTelegramButton({ payload, label, className = "" }: Props) {
  const [state, setState] = useState<State>("idle");
  const [msg, setMsg] = useState<string | null>(null);

  async function send() {
    setState("pending");
    setMsg(null);
    try {
      const res = await fetch("/api/admin/telegram/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || json.ok === false) {
        setMsg(json.error ?? `HTTP ${res.status}`);
        setState("error");
        setTimeout(() => setState("idle"), 5000);
        return;
      }
      setState("ok");
      setTimeout(() => setState("idle"), 2500);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "send failed");
      setState("error");
      setTimeout(() => setState("idle"), 5000);
    }
  }

  const baseClass =
    "text-[11px] rounded px-2 py-1 ring-1 transition disabled:opacity-50";
  const variantClass =
    state === "ok"
      ? "bg-green-500/20 text-green-300 ring-green-500/60"
      : state === "error"
      ? "bg-live/20 text-live ring-live/60"
      : state === "pending"
      ? "bg-ink/60 text-ink-muted ring-ink-line"
      : "bg-ink-soft text-ink-muted ring-ink-line hover:text-white hover:border-[#229ED9] hover:ring-[#229ED9]/60";

  const display =
    state === "ok"
      ? "✓ Sent"
      : state === "error"
      ? `✗ ${truncate(msg ?? "failed", 24)}`
      : state === "pending"
      ? "Sending…"
      : (label ?? "Send to Telegram");

  return (
    <button
      type="button"
      onClick={send}
      disabled={state === "pending"}
      title={state === "error" && msg ? msg : undefined}
      className={`${baseClass} ${variantClass} ${className}`}
    >
      {display}
    </button>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
