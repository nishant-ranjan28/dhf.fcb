"use client";

import { useEffect } from "react";

const SHORTNAME = process.env.NEXT_PUBLIC_DISQUS_SHORTNAME;

interface Props {
  /** Stable identifier for this thread (we use the post slug). */
  identifier: string;
  /** Canonical URL for the post (Disqus uses this to merge threads). */
  url: string;
  /** Display title shown in moderation queues etc. */
  title: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface Window {
    DISQUS?: {
      reset: (opts: {
        reload: boolean;
        config: (this: { page: { url: string; identifier: string; title: string } }) => void;
      }) => void;
    };
    disqus_config?: (this: { page: { url: string; identifier: string; title: string } }) => void;
  }
}

export function DisqusComments({ identifier, url, title }: Props) {
  // Render nothing — and inject nothing — when the env var is absent.
  // No third-party scripts on prod until the operator opts in.
  useEffect(() => {
    if (!SHORTNAME) return;

    // First-mount: load the embed script. Subsequent mounts (Next.js client-
    // side navigation between posts) ask Disqus to re-init with the new page.
    if (typeof window === "undefined") return;
    window.disqus_config = function () {
      this.page.url = url;
      this.page.identifier = identifier;
      this.page.title = title;
    };

    if (window.DISQUS) {
      window.DISQUS.reset({
        reload: true,
        config: function () {
          this.page.url = url;
          this.page.identifier = identifier;
          this.page.title = title;
        },
      });
      return;
    }

    const script = document.createElement("script");
    script.src = `https://${SHORTNAME}.disqus.com/embed.js`;
    script.setAttribute("data-timestamp", String(+new Date()));
    script.async = true;
    document.body.appendChild(script);
  }, [identifier, url, title]);

  if (!SHORTNAME) return null;

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-white mb-3">
        Comments
      </h2>
      <div id="disqus_thread" className="bg-ink-soft border border-ink-line rounded-xl p-3" />
      <noscript className="text-[12px] text-ink-muted">
        Please enable JavaScript to view the comments.
      </noscript>
    </section>
  );
}
