"use client";

import { toggleFollow, useFollows } from "./follows/store";

export function FollowButton({
  team,
  size = "md",
}: {
  team: string;
  /** "sm" for inline use (match header), "md" default (lists). */
  size?: "sm" | "md";
}) {
  const follows = useFollows();
  const following = follows.includes(team);

  const base =
    size === "sm"
      ? "text-[11px] px-2 py-0.5 rounded-full"
      : "text-xs px-3 py-1.5 rounded-full";

  return (
    <button
      type="button"
      onClick={() => toggleFollow(team)}
      aria-pressed={following}
      className={`${base} font-semibold ring-1 transition active:scale-95 ${
        following
          ? "bg-barca-gold/20 text-barca-gold ring-barca-gold/50"
          : "bg-ink-soft text-ink-muted ring-ink-line hover:text-white hover:ring-white/40"
      }`}
    >
      {following ? "★ Following" : "☆ Follow"}
    </button>
  );
}
