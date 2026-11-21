// GitHub Contents API as a tiny durable JSON document store.
//
// This exists so BarcaPulse can keep publishing when Upstash is throttled.
// It is deliberately boring: one JSON document per key, committed to this
// repo on every write. A free GitHub repo has no monthly bandwidth wall, and
// the site already has a token for the Reels workflows.

import { createHash } from "node:crypto";

const API_ROOT = "https://api.github.com";
const STORE_DIR = "data/store";
const CACHE_TTL_MS = 10_000;

export interface StoredDoc<T = unknown> {
  value: T;
  /** Unix ms. Redis-style TTLs are stored alongside the value. */
  expiresAt?: number;
}

interface ContentResponse {
  sha?: string;
  content?: string;
}

export interface GithubDocStore {
  get<T>(key: string): Promise<StoredDoc<T> | null>;
  set<T>(key: string, doc: StoredDoc<T>): Promise<void>;
  del(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

function credentials() {
  const token =
    process.env.GITHUB_BLOG_TOKEN?.trim() ||
    process.env.GITHUB_DISPATCH_TOKEN?.trim();
  const repo =
    process.env.GITHUB_BLOG_REPO?.trim() ||
    process.env.REELS_GITHUB_REPO?.trim() ||
    "nishant-ranjan28/dhf.fcb";
  if (!token) {
    throw new Error(
      "GitHub storage token missing: set GITHUB_BLOG_TOKEN (or GITHUB_DISPATCH_TOKEN) in Vercel",
    );
  }
  return { token, repo };
}

/** Safe, collision-free filename that is still readable in the repo. */
export function docPath(key: string): string {
  const readable = key.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "key";
  const hash = createHash("sha256").update(key).digest("hex").slice(0, 10);
  return `${STORE_DIR}/${readable}-${hash}.json`;
}

function pathFromDocPath(docPathValue: string): string {
  const name = docPathValue.slice(docPathValue.lastIndexOf("/") + 1);
  // filename is <readable>-<10 hex chars>.json
  const match = name.match(/-([0-9a-f]{10})\.json$/);
  return match ? match[1] : "";
}

const cache = new Map<string, { doc: StoredDoc; at: number }>();

function cacheKey(key: string): string {
  return key;
}

async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: T }> {
  const { token, repo } = credentials();
  const url = `${API_ROOT}/repos/${repo}/contents/${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const text = await res.text();
  return {
    status: res.status,
    body: (text ? JSON.parse(text) : null) as T,
  };
}

/** Make a GitHub Contents store scoped to this app's repo and token. */
export function githubDocStore(): GithubDocStore {
  return {
    async get<T>(key: string): Promise<StoredDoc<T> | null> {
      const hit = cache.get(cacheKey(key));
      if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
        return hit.doc.expiresAt && hit.doc.expiresAt <= Date.now()
          ? null
          : (hit.doc as StoredDoc<T>);
      }
      const path = docPath(key);
      const { status, body } = await api<ContentResponse>(
        `${path}?ref=main`,
      );
      if (status === 404) {
        cache.delete(cacheKey(key));
        return null;
      }
      if (status !== 200 || !body?.content) {
        throw new Error(`GitHub store read failed for ${key}: HTTP ${status}`);
      }
      const doc = JSON.parse(
        Buffer.from(body.content.replace(/\s/g, ""), "base64").toString("utf8"),
      ) as StoredDoc<T>;
      if (doc.expiresAt && doc.expiresAt <= Date.now()) return null;
      cache.set(cacheKey(key), { doc: doc as StoredDoc, at: Date.now() });
      return doc;
    },

    async set<T>(key: string, doc: StoredDoc<T>): Promise<void> {
      const path = docPath(key);
      const encoded = Buffer.from(JSON.stringify(doc), "utf8").toString("base64");
      const branch = "main";
      for (let attempt = 0; attempt < 3; attempt++) {
        const current = await api<ContentResponse>(`${path}?ref=${branch}`);
        const sha = current.status === 200 ? current.body?.sha : undefined;
        const res = await api<ContentResponse>(path, {
          method: "PUT",
          body: JSON.stringify({
            message: `store: update ${key}`,
            content: encoded,
            branch,
            ...(sha ? { sha } : {}),
          }),
        });
        if (res.status === 200 || res.status === 201) {
          cache.set(cacheKey(key), { doc: doc as StoredDoc, at: Date.now() });
          return;
        }
        if (res.status !== 409 && res.status !== 422) {
          throw new Error(`GitHub store write failed for ${key}: HTTP ${res.status} ${JSON.stringify(res.body).slice(0, 200)}`);
        }
      }
      throw new Error(`GitHub store write conflict for ${key}`);
    },

    async del(key: string): Promise<void> {
      const path = docPath(key);
      const current = await api<ContentResponse>(`${path}?ref=main`);
      cache.delete(cacheKey(key));
      if (current.status === 404) return;
      if (current.status !== 200 || !current.body?.sha) {
        throw new Error(`GitHub store delete failed for ${key}: HTTP ${current.status}`);
      }
      const res = await api<ContentResponse>(path, {
        method: "DELETE",
        body: JSON.stringify({
          message: `store: delete ${key}`,
          sha: current.body.sha,
          branch: "main",
        }),
      });
      if (res.status !== 200) {
        throw new Error(`GitHub store delete failed for ${key}: HTTP ${res.status}`);
      }
    },

    async keys(): Promise<string[]> {
      const { status, body } = await api<{ name: string }[]>(STORE_DIR);
      if (status === 404) return [];
      if (status !== 200 || !Array.isArray(body)) {
        throw new Error(`GitHub store list failed: HTTP ${status}`);
      }
      // Only used by diagnostics; key hashes are not reversible.
      return body.map((f) => pathFromDocPath(f.name)).filter(Boolean);
    },
  };
}
