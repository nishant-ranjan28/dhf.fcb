# Applying for Google AdSense

The site code is already AdSense-ready. This doc walks you through the application.

## What's already done in code

- ✅ Privacy Policy at `/privacy`
- ✅ Terms of Use at `/terms`
- ✅ About page at `/about`
- ✅ Footer with links to all three on every page
- ✅ Cookie consent banner that **blocks AdSense scripts until accepted** (GDPR-friendly)
- ✅ Three pre-sized ad slots per page — render real `<ins>` blocks when env vars are set, placeholders otherwise (no CLS jump when ads activate)
- ✅ `/admin/*` is `noindex` and disallowed in `robots.txt`
- ✅ All public routes have valid OpenGraph + JSON-LD metadata

## Before you apply — content checklist

AdSense reviewers want to see a "real, useful site". Make sure:

- [ ] **At least 10–20 published blog posts** under `/blog`. Original writing — tactical analysis, opinion, match recaps. Don't apply with just one PSG post.
- [ ] **Custom domain** is live and working. You have `dhf-fcb.iamnishant.in`. Set `SITE_URL` to that exact value in Vercel env so sitemap / OG metadata match.
- [ ] **Site has been live ~2-4 weeks** with consistent organic traffic. Vercel Analytics will show this.
- [ ] **Privacy / Terms / About pages match reality** and link to your real contact email. The pages currently say `hello@iamnishant.in` — register that or change to your actual address.
- [ ] **No copyrighted material as primary content**. RSS aggregation is OK because we link out and only show snippets. Hosting full club photos / official broadcasts = rejection.
- [ ] **Site loads fast on mobile**. Run https://pagespeed.web.dev against your homepage; aim for green Core Web Vitals.

## Apply

1. Go to https://www.google.com/adsense → **Get started**
2. Sign in with the Google account you want associated with payouts
3. Add your site URL: `https://dhf-fcb.iamnishant.in` (or your custom domain). **Use the canonical URL only — don't apply with the `vercel.app` URL.**
4. Country: India (or wherever you bank)
5. Tax info: India PAN/AADHAR, GSTIN if you have one
6. Payment info: bank details (you only need to fill this in once you cross $10 lifetime earnings)
7. Site language: English
8. Verify ownership by adding their snippet to your site. **You don't need to do this manually** — pasting `NEXT_PUBLIC_ADSENSE_CLIENT` in your Vercel env (see step 9) auto-renders the snippet via the script we already gated on consent.

## Vercel env vars (only set after AdSense issues your IDs)

After AdSense approves you (and not before — applying with these set won't help), they'll give you:

| AdSense field | Vercel env var |
|---|---|
| Publisher ID (`ca-pub-XXXXXXXXXXXXXXXX`) | `NEXT_PUBLIC_ADSENSE_CLIENT` |
| Slot ID for the 300×250 unit | `NEXT_PUBLIC_ADSENSE_SLOT_300x250` |
| Slot ID for the 320×100 unit | `NEXT_PUBLIC_ADSENSE_SLOT_320x100` |
| Slot ID for the 320×50 unit | `NEXT_PUBLIC_ADSENSE_SLOT_320x50` |

All four set the same way: Vercel → Settings → Environment Variables → Add → **Sensitive: OFF** (these are public client identifiers, baked into the JS bundle), Environments: Production + Preview.

Redeploy. The ad placeholders flip to real `<ins>` blocks; the script loads after each user accepts the cookie banner.

## What if AdSense rejects?

Most-common reasons for first-time rejection and what to do:

- **"Insufficient content"** → publish more posts. ≥15 quality articles, each 600+ words.
- **"Site under construction"** → ensure all main nav links resolve to populated pages. The bottom nav has Home/Barca/Live/FIFA — make sure those have content (live scores from football-data.org plus blog posts is enough).
- **"Policy violations: copyrighted material"** → rare for a fan site, but ensure cover images on blog posts are either original, licensed, or fair-use editorial. Avoid stadium broadcast screencaps.
- **"Valuable inventory: scraped content"** → ironically, ours could trip this if RSS aggregations dominate. Make sure original blog posts are prominent and the homepage shows them above the news feed.

You can re-apply after addressing the cited reason. There's no penalty for re-application.

## After approval — testing

1. Add the four env vars and redeploy
2. Visit any post in **incognito** so you get the cookie banner
3. Click **Accept** → AdSense script loads → ads start filling within 30–60s
4. Some slots may take 1–24h to start filling because Google needs time to crawl your pages and pick relevant ads
5. Use AdSense's "AdBlock check" to confirm slots are eligible

## Optional improvements after launch

- **Auto Ads**: AdSense can auto-place ads beyond your manual `<ins>` slots. Toggle in AdSense dashboard. May increase revenue but reduces control over layout.
- **Ads.txt**: Place at `/ads.txt` to authorize AdSense as a seller. AdSense generates the file content; serve via `app/ads.txt/route.ts` if you want it dynamic, or as a static file.
- **CMP (Consent Management Platform)**: For full IAB TCF v2 compliance, replace the simple cookie banner with Google's Funding Choices or a third-party CMP. Required only for some EU programmatic ad networks; AdSense itself works with our simple banner.

## Contact for issues

- AdSense application status: https://www.google.com/adsense/new/u/0/sites
- AdSense help: https://support.google.com/adsense
- Site-level issues: edit `docs/adsense.md` and `docs/deploy.md` as you learn more.
