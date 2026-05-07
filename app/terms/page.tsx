import Link from "next/link";

export const metadata = {
  title: "Terms of Use",
  description:
    "Terms governing your use of the BarcaPulse fan site.",
};

export default function TermsPage() {
  return (
    <article className="prose-blog px-4 mt-4 mb-12">
      <h1>Terms of Use</h1>
      <p className="text-[12px] text-ink-muted">Last updated: 7 May 2026</p>

      <p>
        By accessing or using BarcaPulse (&quot;the site&quot;) you agree to these
        Terms of Use. If you don&apos;t agree, please do not use the site.
      </p>

      <h2>1. Independent fan site</h2>
      <p>
        BarcaPulse is an unofficial, independent fan site. It is{" "}
        <strong>
          not affiliated with, endorsed by, or sponsored by Futbol Club Barcelona,
          FIFA, UEFA, La Liga, or any of the news publishers we link to
        </strong>
        . All trademarks, club crests, logos, and player imagery remain the
        property of their respective owners and are used here under fair-use
        editorial-commentary principles.
      </p>

      <h2>2. Editorial content</h2>
      <p>
        Original blog posts on this site are written by the BarcaPulse editorial
        team and reflect personal opinion or analysis. They are not the official
        position of any club or governing body.
      </p>
      <p>
        News headlines and excerpts shown on the home and category pages are
        aggregated from publicly-available RSS feeds; we link to the publisher&apos;s
        site for the full article. Copyright in those articles remains with the
        original publisher.
      </p>

      <h2>3. Live scores and statistics</h2>
      <p>
        Live scores, fixtures, lineups, events, and stats come from third-party
        data providers. We make best efforts to display accurate data but do not
        guarantee accuracy, completeness, or timeliness. Scores may be delayed,
        revised, or wrong; do not rely on this site for betting, fantasy, or any
        decision with consequences.
      </p>

      <h2>4. Acceptable use</h2>
      <p>
        Don&apos;t do illegal things using the site. In particular, do not:
      </p>
      <ul>
        <li>scrape or republish our content at scale without permission</li>
        <li>attempt to bypass admin authentication or rate limits</li>
        <li>upload or post content that is unlawful, defamatory, or infringes
            others&apos; rights (applies if you post via Disqus comments)</li>
        <li>interfere with the site&apos;s normal operation</li>
      </ul>

      <h2>5. Comments</h2>
      <p>
        Comments on blog posts are powered by Disqus and are subject to{" "}
        <a
          href="https://help.disqus.com/en/articles/1717196-terms-of-service"
          target="_blank"
          rel="noopener noreferrer"
        >
          Disqus&apos;s Terms of Service
        </a>{" "}
        in addition to these terms. We reserve the right to remove or moderate
        comments that violate either set of terms.
      </p>

      <h2>6. Advertising</h2>
      <p>
        Pages may display third-party advertisements (Google AdSense). Ad content
        is selected by Google and we don&apos;t endorse any individual ad. If you
        believe an ad violates Google&apos;s policies, report it via the{" "}
        <a
          href="https://support.google.com/adsense/troubleshooter/1631343"
          target="_blank"
          rel="noopener noreferrer"
        >
          Ad Inquiries form
        </a>
        .
      </p>

      <h2>7. Intellectual property</h2>
      <p>
        Original blog posts and the BarcaPulse name and design are © BarcaPulse,
        all rights reserved. You may share short quotations with attribution and a
        link back. Wholesale republication requires written permission.
      </p>
      <p>
        Third-party trademarks, logos, photographs, and headlines belong to their
        respective owners. If you are a rights-holder and believe content should
        be removed, contact{" "}
        <a href="mailto:hello@iamnishant.in">hello@iamnishant.in</a> with
        specifics — we honor good-faith takedown requests.
      </p>

      <h2>8. Disclaimer of warranty</h2>
      <p>
        The site is provided &quot;as is&quot; and &quot;as available&quot;
        without warranty of any kind, express or implied, including but not
        limited to merchantability, fitness for a particular purpose,
        non-infringement, accuracy, or availability.
      </p>

      <h2>9. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, BarcaPulse and its operator are
        not liable for any indirect, incidental, special, consequential, or
        punitive damages arising from your use of (or inability to use) the site.
        Total aggregate liability shall not exceed &#8377;1,000.
      </p>

      <h2>10. Governing law</h2>
      <p>
        These terms are governed by the laws of India. Any disputes shall be
        subject to the exclusive jurisdiction of the courts of Bengaluru,
        Karnataka.
      </p>

      <h2>11. Changes</h2>
      <p>
        We may update these terms from time to time. The &quot;last updated&quot;
        date at the top reflects the latest revision. Continued use of the site
        after a change constitutes acceptance of the new terms.
      </p>

      <h2>12. Contact</h2>
      <p>
        Questions:{" "}
        <a href="mailto:hello@iamnishant.in">hello@iamnishant.in</a>
      </p>

      <p className="text-[12px] text-ink-muted">
        See also: <Link href="/about">About</Link> ·{" "}
        <Link href="/privacy">Privacy</Link>
      </p>
    </article>
  );
}
