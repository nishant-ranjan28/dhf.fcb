"use client";

import { useState } from "react";

interface Props {
  url: string;
  title: string;
  /** One-line summary; included in the pre-filled share text for X/WhatsApp/Telegram. */
  excerpt?: string;
  /** Lowercase tags; the top 2 become X hashtags. */
  tags?: string[];
}

export function ShareButtons({ url, title, excerpt, tags }: Props) {
  const [copied, setCopied] = useState(false);

  const enc = (s: string) => encodeURIComponent(s);
  const u = enc(url);

  // X/Twitter renders the URL as an attached card, so we put title + excerpt
  // in the text and pass the URL separately to avoid a double-link.
  const xText = excerpt ? `${title}\n\n${excerpt}` : title;
  const xHashtags = (tags ?? [])
    .filter((t) => /^[a-z0-9]+$/i.test(t)) // X hashtags can't contain dashes/spaces
    .slice(0, 2)
    .join(",");
  const xHref =
    `https://twitter.com/intent/tweet?url=${u}&text=${enc(xText)}` +
    (xHashtags ? `&hashtags=${enc(xHashtags)}` : "");

  // WhatsApp has a single text param — the URL goes inside the message body.
  const waText = excerpt ? `${title}\n\n${excerpt}\n\n${url}` : `${title} ${url}`;
  const waHref = `https://wa.me/?text=${enc(waText)}`;

  // Telegram accepts url + text separately.
  const tgText = excerpt ? `${title} — ${excerpt}` : title;
  const tgHref = `https://t.me/share/url?url=${u}&text=${enc(tgText)}`;

  // Facebook's sharer.php only honors the URL — text params are ignored.
  // The share dialog reads our page's OG meta tags (title, description, image)
  // to fill the card. See app/blog/[slug]/page.tsx generateMetadata.
  const fbHref = `https://www.facebook.com/sharer/sharer.php?u=${u}`;

  const targets = [
    {
      name: "X",
      label: "Share on X",
      href: xHref,
      color: "hover:bg-[#1d9bf0]/20 hover:ring-[#1d9bf0]/60 hover:text-white",
      icon: (
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current" aria-hidden>
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      ),
    },
    {
      name: "WhatsApp",
      label: "Share on WhatsApp",
      href: waHref,
      color: "hover:bg-[#25d366]/20 hover:ring-[#25d366]/60 hover:text-white",
      icon: (
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current" aria-hidden>
          <path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.557-5.339 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 0 0 1.519 5.265l-.999 3.648 3.969-1.612zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z" />
        </svg>
      ),
    },
    {
      name: "Telegram",
      label: "Share on Telegram",
      href: tgHref,
      color: "hover:bg-[#229ED9]/20 hover:ring-[#229ED9]/60 hover:text-white",
      icon: (
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current" aria-hidden>
          <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
        </svg>
      ),
    },
    {
      name: "Facebook",
      label: "Share on Facebook",
      href: fbHref,
      color: "hover:bg-[#1877f2]/20 hover:ring-[#1877f2]/60 hover:text-white",
      icon: (
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current" aria-hidden>
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      ),
    },
  ] as const;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback for browsers without clipboard API
      window.prompt("Copy this link:", url);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 my-3">
      <span className="text-[11px] text-ink-muted mr-1">Share</span>
      {targets.map((t) => (
        <a
          key={t.name}
          href={t.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t.label}
          className={`inline-flex items-center gap-1.5 text-[11px] text-ink-muted bg-ink-soft ring-1 ring-ink-line px-2 py-1 rounded transition ${t.color}`}
        >
          {t.icon}
          <span>{t.name}</span>
        </a>
      ))}
      <button
        type="button"
        onClick={copyLink}
        aria-label="Copy link"
        className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded transition ring-1 ${
          copied
            ? "bg-green-500/20 ring-green-500/60 text-green-300"
            : "text-ink-muted bg-ink-soft ring-ink-line hover:text-white hover:bg-ink hover:ring-ink-muted"
        }`}
      >
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="2" aria-hidden>
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V5a2 2 0 0 1 2-2h10" />
        </svg>
        <span>{copied ? "Copied!" : "Copy link"}</span>
      </button>
    </div>
  );
}
