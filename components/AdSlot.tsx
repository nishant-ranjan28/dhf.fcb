// Ads scaffold. When NEXT_PUBLIC_ADSENSE_CLIENT (and the matching slot env)
// are set, AdSlot renders Google AdSense's <ins> block and the layout-mounted
// adsbygoogle.js loader handles the rest. Until then, a dashed placeholder
// box with the right dimensions reserves the layout space — no CLS jump
// when ads activate later.

type AdSize = "300x250" | "320x100" | "320x50";

const SLOT_ENV: Record<AdSize, string | undefined> = {
  "300x250": process.env.NEXT_PUBLIC_ADSENSE_SLOT_300x250,
  "320x100": process.env.NEXT_PUBLIC_ADSENSE_SLOT_320x100,
  "320x50": process.env.NEXT_PUBLIC_ADSENSE_SLOT_320x50,
};

const DIMS: Record<AdSize, { h: string; w: string; hPx: number; wPx: number }> = {
  "300x250": { h: "h-[250px]", w: "w-[300px]", hPx: 250, wPx: 300 },
  "320x100": { h: "h-[100px]", w: "w-[320px]", hPx: 100, wPx: 320 },
  "320x50": { h: "h-[50px]", w: "w-[320px]", hPx: 50, wPx: 320 },
};

function adsenseEnabled(size: AdSize): boolean {
  return Boolean(process.env.NEXT_PUBLIC_ADSENSE_CLIENT && SLOT_ENV[size]);
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
      <div className={`mx-auto my-3 ${dims.w} ${dims.h}`}>
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

  return (
    <div
      data-ad-slot={size}
      className={`mx-4 my-3 ${dims.h} bg-ink-soft border border-dashed border-ink-line rounded-lg flex items-center justify-center text-ink-muted text-xs uppercase tracking-wide`}
    >
      {label} · {size}
    </div>
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

  return (
    <div
      data-ad-slot="320x50"
      className="fixed bottom-14 inset-x-0 z-20 mx-auto max-w-screen h-[50px] bg-ink-soft border-t border-ink-line flex items-center justify-center text-ink-muted text-[10px] uppercase tracking-wide"
    >
      Ad · 320x50
    </div>
  );
}
