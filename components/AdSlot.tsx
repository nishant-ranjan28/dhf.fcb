export function AdSlot({
  size = "300x250",
  label = "Ad",
}: {
  size?: "300x250" | "320x100" | "320x50";
  label?: string;
}) {
  const dims = {
    "300x250": "h-[250px]",
    "320x100": "h-[100px]",
    "320x50": "h-[50px]",
  } as const;
  return (
    <div
      data-ad-slot={size}
      className={`mx-4 my-3 ${dims[size]} bg-ink-soft border border-dashed border-ink-line rounded-lg flex items-center justify-center text-ink-muted text-xs uppercase tracking-wide`}
    >
      {label} · {size}
    </div>
  );
}

export function StickyBottomAd() {
  return (
    <div
      data-ad-slot="320x50"
      className="fixed bottom-14 inset-x-0 z-20 mx-auto max-w-screen h-[50px] bg-ink-soft border-t border-ink-line flex items-center justify-center text-ink-muted text-[10px] uppercase tracking-wide"
    >
      Ad · 320x50
    </div>
  );
}
