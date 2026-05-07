"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewPostForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [body, setBody] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [tags, setTags] = useState("");
  const [author, setAuthor] = useState("");
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshPreview() {
    if (!body.trim()) {
      setPreviewHtml("");
      return;
    }
    try {
      const res = await fetch("/api/admin/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (res.ok) {
        const json = (await res.json()) as { html: string };
        setPreviewHtml(json.html);
      } else {
        setPreviewHtml("<p>Preview failed.</p>");
      }
    } catch {
      setPreviewHtml("<p>Preview failed (network).</p>");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/blog", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          excerpt: excerpt || undefined,
          body,
          coverImage: coverImage || undefined,
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          author: author || undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        post?: { slug: string };
        error?: string;
      };
      if (!res.ok) {
        setError(json.error ?? `Save failed (${res.status})`);
        setPending(false);
        return;
      }
      if (json.post?.slug) {
        router.replace(`/blog/${json.post.slug}`);
      } else {
        router.replace("/admin/blog");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3">
      <Field label="Title">
        <input
          type="text"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputClass}
          placeholder="Why Barca's high line works against Real"
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Author (optional)">
          <input
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            className={inputClass}
            placeholder="BarcaPulse"
          />
        </Field>
        <Field label="Tags (comma separated)">
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className={inputClass}
            placeholder="tactics, yamal, clasico"
          />
        </Field>
      </div>

      <Field label="Cover image URL (optional)">
        <input
          type="url"
          value={coverImage}
          onChange={(e) => setCoverImage(e.target.value)}
          className={inputClass}
          placeholder="https://..."
        />
      </Field>

      <Field label="Excerpt (optional — auto-derived if empty)">
        <input
          type="text"
          value={excerpt}
          onChange={(e) => setExcerpt(e.target.value)}
          className={inputClass}
          placeholder="One-sentence summary"
        />
      </Field>

      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="block text-[11px] uppercase tracking-wide text-ink-muted">
            Body (Markdown)
          </span>
          <div className="flex items-center gap-1 text-[11px]">
            <button
              type="button"
              onClick={() => setTab("write")}
              className={`px-2 py-0.5 rounded ${
                tab === "write"
                  ? "bg-barca-blue/30 text-white ring-1 ring-barca-blue/60"
                  : "text-ink-muted ring-1 ring-ink-line"
              }`}
            >
              Write
            </button>
            <button
              type="button"
              onClick={() => {
                setTab("preview");
                refreshPreview();
              }}
              className={`px-2 py-0.5 rounded ${
                tab === "preview"
                  ? "bg-barca-blue/30 text-white ring-1 ring-barca-blue/60"
                  : "text-ink-muted ring-1 ring-ink-line"
              }`}
            >
              Preview
            </button>
          </div>
        </div>
        {tab === "write" ? (
          <textarea
            required
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={18}
            className={`${inputClass} font-mono text-[13px]`}
            placeholder={`# Heading

Write the post body in Markdown.

![cover](https://example.com/img.jpg)

Paste a YouTube URL on its own line to embed:

https://youtu.be/dQw4w9WgXcQ

Or paste any iframe HTML directly.`}
          />
        ) : (
          <div
            className="prose-blog mt-1 min-h-[200px] bg-ink border border-ink-line rounded-md p-3 text-[14px] text-white"
            dangerouslySetInnerHTML={{ __html: previewHtml || "<p style=\"color:#9CA3AF\">Nothing to preview.</p>" }}
          />
        )}
      </div>

      {error && <p className="text-[12px] text-live">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending || !title || !body}
          className="rounded-md bg-barca-blue text-white text-sm font-semibold px-4 py-2 disabled:opacity-50"
        >
          {pending ? "Publishing…" : "Publish"}
        </button>
        <a href="/admin/blog" className="text-[12px] text-ink-muted">
          Cancel
        </a>
      </div>
    </form>
  );
}

const inputClass =
  "w-full bg-ink border border-ink-line rounded-md px-3 py-2 text-sm text-white placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-barca-blue";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wide text-ink-muted mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}
