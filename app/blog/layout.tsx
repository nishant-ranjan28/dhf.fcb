import { AdSlot } from "@/components/AdSlot";

// Blog-only desktop shell. The rest of the site keeps its mobile-first 640px
// column; /blog and /blog/[slug] opt into a wider two-column layout (see the
// `main:has(> [data-wide-layout])` rules in globals.css). Mobile keeps the
// exact same single-column flow as before — the rail is hidden there.
export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-wide-layout className="blog-shell">
      <div className="blog-shell__content min-w-0">{children}</div>
      <aside className="blog-shell__rail hidden lg:block" aria-label="Advertisement rail">
        <AdSlot size="300x250" />
        <AdSlot size="160x600" />
        <AdSlot size="300x250" label="Sponsored" />
      </aside>
    </div>
  );
}
