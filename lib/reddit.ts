// Reddit link posts via the free "script" OAuth app flow. The account must be
// able to submit in the configured subreddit (check its self-promotion rules).

const AUTH_URL = "https://www.reddit.com/api/v1/access_token";
const API_URL = "https://oauth.reddit.com/api/v1/links";

export interface RedditResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export function isRedditConfigured(): boolean {
  return Boolean(
    process.env.REDDIT_CLIENT_ID?.trim() &&
      process.env.REDDIT_CLIENT_SECRET?.trim() &&
      process.env.REDDIT_USERNAME?.trim() &&
      process.env.REDDIT_PASSWORD?.trim() &&
      process.env.REDDIT_SUBREDDIT?.trim(),
  );
}

function userAgent(): string {
  const user = process.env.REDDIT_USERNAME?.trim() ?? "barcapulse";
  return `BarcaPulse-AutoPost/1.0 (by /u/${user})`;
}

async function describeError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  return `HTTP ${res.status}: ${text.replace(/\s+/g, " ").slice(0, 300)}`;
}

export async function postToReddit(opts: {
  title: string;
  url: string;
}): Promise<RedditResult> {
  if (!isRedditConfigured()) return { ok: false, error: "Reddit not configured" };

  const id = process.env.REDDIT_CLIENT_ID!.trim();
  const secret = process.env.REDDIT_CLIENT_SECRET!.trim();
  const username = process.env.REDDIT_USERNAME!.trim();
  const password = process.env.REDDIT_PASSWORD!.trim();
  const subreddit = process.env.REDDIT_SUBREDDIT!.trim().replace(/^\/?r\//, "");

  try {
    const authBody = new URLSearchParams({
      grant_type: "password",
      username,
      password,
    });
    const authRes = await fetch(AUTH_URL, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": userAgent(),
      },
      body: authBody,
      signal: AbortSignal.timeout(8000),
    });
    if (!authRes.ok) return { ok: false, error: await describeError(authRes) };
    const auth = (await authRes.json()) as { access_token?: string };
    if (!auth.access_token) return { ok: false, error: "Reddit auth returned no token" };

    const submitBody = new URLSearchParams({
      sr: subreddit,
      kind: "link",
      title: opts.title,
      url: opts.url,
      api_type: "json",
      resubmit: "false",
      sendreplies: "false",
    });
    const submitRes = await fetch(API_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${auth.access_token}`,
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": userAgent(),
      },
      body: submitBody,
      signal: AbortSignal.timeout(8000),
    });
    if (!submitRes.ok) return { ok: false, error: await describeError(submitRes) };
    const data = (await submitRes.json().catch(() => ({}))) as {
      json?: { errors?: unknown[][] };
    };
    const errors = data.json?.errors;
    if (errors && errors.length > 0) {
      return {
        ok: false,
        error: errors
          .map((e) => String(e?.[1] ?? "unknown"))
          .join("; ")
          .slice(0, 300),
      };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
