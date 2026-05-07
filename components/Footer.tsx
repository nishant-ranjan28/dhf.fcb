import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-ink-line bg-ink-soft mt-8 pb-20">
      <div className="mx-auto max-w-screen px-4 py-5 text-[12px] text-ink-muted">
        <p className="mb-2">
          <strong className="text-white">BarcaPulse</strong> — independent fan site for
          FC Barcelona &amp; the FIFA World Cup. Not affiliated with FC Barcelona, FIFA,
          UEFA, or any of the news publishers we link to. Trademarks and copyrights
          belong to their respective owners.
        </p>
        <nav className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3">
          <Link href="/" className="hover:text-white">Home</Link>
          <span aria-hidden>·</span>
          <Link href="/blog" className="hover:text-white">Blog</Link>
          <span aria-hidden>·</span>
          <Link href="/about" className="hover:text-white">About</Link>
          <span aria-hidden>·</span>
          <Link href="/privacy" className="hover:text-white">Privacy</Link>
          <span aria-hidden>·</span>
          <Link href="/terms" className="hover:text-white">Terms</Link>
          <span aria-hidden>·</span>
          <a
            href="mailto:hello@dhfbarca.com"
            className="hover:text-white"
          >
            Contact
          </a>
        </nav>
        <p className="mt-3 text-[11px]">
          © {new Date().getFullYear()} BarcaPulse. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
