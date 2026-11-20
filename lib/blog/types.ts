export interface BlogPost {
  slug: string;
  title: string;
  /** Short summary shown on the list page. Plain text, ~200 chars max. */
  excerpt: string;
  /** Full body in Markdown. Raw HTML allowed (admin-only writes, trusted). */
  body: string;
  /** Optional URL to a hero image rendered above the post. */
  coverImage?: string;
  /** Official social posts announcing this story, captured after publish. */
  socialPosts?: SocialPostLink[];
  /** Lower-case, slug-friendly tags. */
  tags: string[];
  /** ISO timestamp; written once on create. */
  createdAt: string;
  /** ISO timestamp; updated on edit. Same as createdAt at creation. */
  updatedAt: string;
  author: string;
}

export type SocialPlatform = "facebook" | "bluesky" | "mastodon" | "threads";

export interface SocialPostLink {
  platform: SocialPlatform;
  /** Public permalink returned by the platform after autopost announces. */
  url: string;
}

export interface BlogPostInput {
  title: string;
  excerpt?: string;
  body: string;
  coverImage?: string;
  socialPosts?: SocialPostLink[];
  tags?: string[];
  author?: string;
}
