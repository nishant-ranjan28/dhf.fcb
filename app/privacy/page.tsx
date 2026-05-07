import Link from "next/link";

export const metadata = {
  title: "Privacy Policy",
  description:
    "How BarcaPulse handles cookies, third-party services, and your data.",
};

export default function PrivacyPage() {
  return (
    <article className="prose-blog px-4 mt-4 mb-12">
      <h1>Privacy Policy</h1>
      <p className="text-[12px] text-ink-muted">
        Last updated: 7 May 2026
      </p>

      <p>
        This Privacy Policy explains what information BarcaPulse collects, why we
        collect it, and the choices you have. We strive to keep this honest and
        readable.
      </p>

      <h2>1. Who we are</h2>
      <p>
        BarcaPulse (&quot;we&quot;, &quot;our&quot;, &quot;the site&quot;) is an
        independent fan site focused on FC Barcelona and the FIFA World Cup. The
        site is operated by Nishant Ranjan as a personal project.
      </p>

      <h2>2. Data we collect</h2>
      <p>
        We do not ask you to create an account, sign up, or submit personal
        information to use the site.
      </p>
      <ul>
        <li>
          <strong>Page-view counters</strong>: when you open a blog post, your
          browser tells our server which slug you opened. We increment a per-post
          counter (an integer) in our database. We do not store IP addresses,
          user-agent strings, or anything that identifies you with that increment.
        </li>
        <li>
          <strong>Aggregate analytics</strong>: we use Vercel Web Analytics to count
          page views and basic referrer info. Vercel processes this data without
          cookies and without identifying individual visitors. See{" "}
          <a
            href="https://vercel.com/docs/analytics/privacy-policy"
            target="_blank"
            rel="noopener noreferrer"
          >
            Vercel&apos;s privacy policy
          </a>
          .
        </li>
        <li>
          <strong>Admin authentication cookie</strong>: only set after a successful
          admin login and only used to keep the admin session alive. Public
          visitors never see this cookie.
        </li>
      </ul>
      <p>
        We do not run trackers, pixels, fingerprinting, or behavioral profiling
        ourselves.
      </p>

      <h2>3. Cookies and similar technologies</h2>
      <p>
        We use the following cookies / storage:
      </p>
      <ul>
        <li>
          <strong>Strictly necessary</strong>:{" "}
          <code>barca_admin</code> (admin auth, only set on admin login),{" "}
          <code>cookie_consent</code> (remembers your consent choice). These do not
          identify you and are required for the site to function.
        </li>
        <li>
          <strong>Optional / set by third parties only after you consent</strong>:{" "}
          Google AdSense (for advertising), Disqus (for comments) — see Section 4.
        </li>
        <li>
          <strong>Browser session storage</strong>:{" "}
          <code>bp:viewed:&lt;slug&gt;</code> — used so refreshing a page within
          the same tab doesn&apos;t double-count a view. Cleared when you close
          the tab.
        </li>
      </ul>
      <p>
        You can withdraw consent any time by clearing site data in your browser or
        clicking the consent banner if it reappears.
      </p>

      <h2>4. Third-party services</h2>
      <p>
        Some site features rely on third-party services. When enabled, those
        services may set their own cookies and process data according to their own
        policies.
      </p>
      <ul>
        <li>
          <strong>Google AdSense</strong> — serves advertisements on some pages.
          AdSense uses cookies for ad personalization, frequency capping, and
          fraud prevention. See Google&apos;s{" "}
          <a
            href="https://policies.google.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
          >
            Privacy Policy
          </a>{" "}
          and{" "}
          <a
            href="https://adssettings.google.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            Ads Settings
          </a>{" "}
          to manage your preferences. Ad scripts are not loaded until you accept
          cookies via our consent banner.
        </li>
        <li>
          <strong>Disqus</strong> — provides the comments system on blog posts.
          Disqus may set cookies and process data when you load a comment thread
          or post a comment. See{" "}
          <a
            href="https://help.disqus.com/en/articles/1717103-disqus-privacy-policy"
            target="_blank"
            rel="noopener noreferrer"
          >
            Disqus Privacy Policy
          </a>
          .
        </li>
        <li>
          <strong>Telegram</strong> — clicking our Telegram CTA takes you to{" "}
          <code>t.me</code>. We do not pass any data; Telegram&apos;s policy applies
          once you arrive.
        </li>
        <li>
          <strong>Football data providers</strong> — we fetch fixtures and live
          scores from football-data.org and API-Football. These calls happen
          server-to-server; no data about you is sent.
        </li>
        <li>
          <strong>News sources</strong> — we aggregate headlines from RSS feeds
          published by BBC Sport, The Guardian, Marca, Mundo Deportivo, and r/Barca.
          We display the headline and a link to the original article; clicking
          a link takes you to that publisher&apos;s site under their privacy
          policy.
        </li>
        <li>
          <strong>Vercel</strong> — our hosting provider. Vercel processes basic
          request metadata (IP, user-agent) for security, abuse prevention, and
          analytics. See{" "}
          <a
            href="https://vercel.com/legal/privacy-policy"
            target="_blank"
            rel="noopener noreferrer"
          >
            Vercel&apos;s privacy policy
          </a>
          .
        </li>
      </ul>

      <h2>5. International data transfers</h2>
      <p>
        Our hosting and analytics providers may process data in regions outside
        your country of residence (typically the United States and European
        Union). They have committed to appropriate safeguards for international
        transfers; see their respective privacy policies.
      </p>

      <h2>6. Data retention</h2>
      <p>
        Page-view counters and blog posts are stored in our database indefinitely.
        We do not associate them with individual users. Admin login sessions
        expire after 30 days. Vercel and AdSense follow their own retention
        schedules.
      </p>

      <h2>7. Your rights (EU/UK/India)</h2>
      <p>
        Depending on where you live, you may have rights to:
      </p>
      <ul>
        <li>access the personal data we hold about you</li>
        <li>request deletion or correction</li>
        <li>object to or restrict certain processing</li>
        <li>port your data</li>
        <li>withdraw consent for cookies/ads at any time</li>
      </ul>
      <p>
        Because we don&apos;t collect identifiers tied to individuals, in most
        cases we have nothing to delete. To exercise rights regarding third-party
        services (AdSense, Disqus, Vercel Analytics), please contact those
        services directly. To raise any concern with us, email{" "}
        <a href="mailto:hello@dhfbarca.com">hello@dhfbarca.com</a>.
      </p>

      <h2>8. Children</h2>
      <p>
        BarcaPulse is not directed at children under 13. We do not knowingly
        collect data from children.
      </p>

      <h2>9. Changes</h2>
      <p>
        If this policy changes materially, we will update the &quot;last
        updated&quot; date at the top and, where appropriate, post a notice on
        the homepage.
      </p>

      <h2>10. Contact</h2>
      <p>
        Privacy questions:{" "}
        <a href="mailto:hello@dhfbarca.com">hello@dhfbarca.com</a>
      </p>

      <p className="text-[12px] text-ink-muted">
        See also: <Link href="/about">About</Link> ·{" "}
        <Link href="/terms">Terms</Link>
      </p>
    </article>
  );
}
