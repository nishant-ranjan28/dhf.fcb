"use client";

import { useEffect, useState } from "react";

// Client-only followed-teams store, persisted to localStorage (no login).
// A tiny pub/sub keeps every FollowButton + the personalised feed in sync
// within a page; the storage event syncs across tabs.

const KEY = "bp:follows";
const listeners = new Set<() => void>();

export function getFollows(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? (raw as string[]) : [];
  } catch {
    return [];
  }
}

function save(list: string[]): void {
  localStorage.setItem(KEY, JSON.stringify(list));
  listeners.forEach((l) => l());
}

export function isFollowing(team: string): boolean {
  return getFollows().includes(team);
}

export function toggleFollow(team: string): boolean {
  const list = getFollows();
  const i = list.indexOf(team);
  if (i >= 0) list.splice(i, 1);
  else list.push(team);
  save(list);
  return i < 0; // true if now following
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) l();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

/** React hook: the current followed-team list, kept in sync. Starts empty on
 *  the server / first paint (localStorage is client-only) to stay
 *  hydration-safe, then fills in after mount. */
export function useFollows(): string[] {
  const [follows, setFollows] = useState<string[]>([]);
  useEffect(() => {
    const read = () => setFollows(getFollows());
    read();
    return subscribe(read);
  }, []);
  return follows;
}
