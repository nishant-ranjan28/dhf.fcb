// Ads scaffold. Per size, AdSlot renders the first configured network:
// AdSense (<ins> block + layout-mounted loader) → Adsterra (consent-gated
// iframe) → dashed placeholder that reserves the layout space so there's no
// CLS jump when ads activate later.
//
// Desktop-width formats (468x60, 728x90) are hidden below md — they'd
// overflow the mobile-first single-column layout.

import { AdsterraBanner } from "@/components/AdsterraBanner";

type AdSize =
  | "300x250"
  | "320x100"
  | "320x50"
  | "160x300"
  | "160x600"
  | "468x60"
  | "728x90";

const SLOT_ENV: Record<AdSize, string | undefined> = {
  "300x250": process.env.NEXT_PUBLIC_ADSENSE_SLOT_300x250,
  "320x100": process.env.NEXT_PUBLIC_ADSENSE_SLOT_320x100,
  "320x50": process.env.NEXT_PUBLIC_ADSENSE_SLOT_320x50,
  "160x300": process.env.NEXT_PUBLIC_ADSENSE_SLOT_160x300,
  "160x600": process.env.NEXT_PUBLIC_ADSENSE_SLOT_160x600,
  "468x60": process.env.NEXT_PUBLIC_ADSENSE_SLOT_468x60,
  "728x90": process.env.NEXT_PUBLIC_ADSENSE_SLOT_728x90,
};

const ADSTERRA_ENV: Record<AdSize, string | undefined> = {
  "300x250": process.env.NEXT_PUBLIC_ADSTERRA_KEY_300x250,
  "320x100": process.env.NEXT_PUBLIC_ADSTERRA_KEY_320x100,
  "320x50": process.env.NEXT_PUBLIC_ADSTERRA_KEY_320x50,
  "160x300": process.env.NEXT_PUBLIC_ADSTERRA_KEY_160x300,
  "160x600": process.env.NEXT_PUBLIC_ADSTERRA_KEY_160x600,
  "468x60": process.env.NEXT_PUBLIC_ADSTERRA_KEY_468x60,
  "728x90": process.env.NEXT_PUBLIC_ADSTERRA_KEY_728x90,
};

const DIMS: Record<AdSize, { h: string; w: string; hPx: number; wPx: number }> = {
  "300x250": { h: "h-[250px]", w: "w-[300px]", hPx: 250, wPx: 300 },
  "320x100": { h: "h-[100px]", w: "w-[320px]", hPx: 100, wPx: 320 },
  "320x50": { h: "h-[50px]", w: "w-[320px]", hPx: 50, wPx: 320 },
  "160x300": { h: "h-[300px]", w: "w-[160px]", hPx: 300, wPx: 160 },
  "160x600": { h: "h-[600px]", w: "w-[160px]", hPx: 600, wPx: 160 },
  "468x60": { h: "h-[60px]", w: "w-[468px]", hPx: 60, wPx: 468 },
  "728x90": { h: "h-[90px]", w: "w-[728px]", hPx: 90, wPx: 728 },
};

// Wider than any phone viewport — render only from md up.
const DESKTOP_ONLY: ReadonlySet<AdSize> = new Set(["468x60", "728x90"]);

function adsenseEnabled(size: AdSize): boolean {
  return Boolean(process.env.NEXT_PUBLIC_ADSENSE_CLIENT && SLOT_ENV[size]);
}

function visibility(size: AdSize): string {
  return DESKTOP_ONLY.has(size) ? "hidden md:block" : "";
}

export function AdSlot({
  size = "300x250",
  label = "Ad",
}: {
  size?: AdSize;
  label?: string;
}) {
  const dims = DIMS[size];

  if (adsenseEnabled(size)) {
    return (
      <div className={`${visibility(size)} mx-auto my-3 ${dims.w} ${dims.h}`}>
        <ins
          className="adsbygoogle"
          style={{
            display: "block",
            width: `${dims.wPx}px`,
            height: `${dims.hPx}px`,
          }}
          data-ad-client={process.env.NEXT_PUBLIC_ADSENSE_CLIENT}
          data-ad-slot={SLOT_ENV[size]}
          data-ad-format="auto"
        />
      </div>
    );
  }

  const adsterraKey = ADSTERRA_ENV[size];
  if (adsterraKey) {
    return (
      <div className={`${visibility(size)} mx-auto my-3 ${dims.w} ${dims.h}`}>
        <AdsterraBanner adKey={adsterraKey} width={dims.wPx} height={dims.hPx} />
      </div>
    );
  }

  // Unconfigured slot: dashed placeholder in dev (shows where ads will live),
  // nothing in production (a "coming soon" box on a live page is just noise;
  // no CLS concern because an unconfigured slot never loads anything).
  if (process.env.NODE_ENV === "production") return null;

  return (
    <div
      data-ad-slot={size}
      className={`${visibility(size)} mx-4 my-3 ${dims.h} bg-ink-soft border border-dashed border-ink-line rounded-lg flex items-center justify-center text-ink-muted text-xs uppercase tracking-wide`}
    >
      {label} · {size}
    </div>
  );
}

/** Header-adjacent horizontal banner: 728x90 on lg+, 468x60 on md–lg,
 *  nothing on mobile (mobile has the sticky bottom + in-content slots). */
export function LeaderboardAd() {
  return (
    <>
      <div className="hidden md:block lg:hidden">
        <AdSlot size="468x60" />
      </div>
      <div className="hidden lg:block">
        <AdSlot size="728x90" />
      </div>
    </>
  );
}

/** Desktop side rail flanking the 640px content column. xl+ only — below
 *  that there's no horizontal room. Sticky so the skyscraper stays in view
 *  while the column scrolls. */
export function SideRail({ side }: { side: "left" | "right" }) {
  return (
    <aside
      aria-label="Advertisement rail"
      className="hidden xl:flex flex-col gap-4 sticky top-16 self-start w-[160px] shrink-0"
    >
      <AdSlot size="160x600" />
      {side === "right" && <AdSlot size="160x300" />}
    </aside>
  );
}

export function StickyBottomAd() {
  if (adsenseEnabled("320x50")) {
    return (
      <div className="fixed bottom-14 inset-x-0 z-20 mx-auto max-w-screen h-[50px] flex items-center justify-center bg-ink">
        <ins
          className="adsbygoogle"
          style={{ display: "block", width: "320px", height: "50px" }}
          data-ad-client={process.env.NEXT_PUBLIC_ADSENSE_CLIENT}
          data-ad-slot={SLOT_ENV["320x50"]}
          data-ad-format="auto"
        />
      </div>
    );
  }

  const adsterraKey = ADSTERRA_ENV["320x50"];
  if (adsterraKey) {
    return (
      <div className="fixed bottom-14 inset-x-0 z-20 mx-auto max-w-screen h-[50px] flex items-center justify-center bg-ink">
        <AdsterraBanner adKey={adsterraKey} width={320} height={50} />
      </div>
    );
  }

  if (process.env.NODE_ENV === "production") return null;

  return (
    <div
      data-ad-slot="320x50"
      className="fixed bottom-14 inset-x-0 z-20 mx-auto max-w-screen h-[50px] bg-ink-soft border-t border-ink-line flex items-center justify-center text-ink-muted text-[10px] uppercase tracking-wide"
    >
      Ad · 320x50
    </div>
  );
}
