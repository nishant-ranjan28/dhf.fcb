import type { Competition, NewsPost } from "./types";
import { toSlug } from "./slug";

// In-memory news. Replace with DB or CMS later — public API stays the same.

const now = Date.now();
const ago = (mins: number) => new Date(now - mins * 60_000).toISOString();

const POSTS: NewsPost[] = [
  {
    id: "1",
    title: "Lineup vs Madrid announced 🔥",
    content:
      "Xavi sticks with the 4-3-3. Yamal and Raphinha flank Lewandowski; Pedri returns to the midfield three. Cubarsí partners Araújo at the back. Expect a high press from minute one.",
    category: "barca",
    createdAt: ago(8),
    slug: "lineup-vs-madrid-announced",
  },
  {
    id: "2",
    title: "Lewandowski hits 200 club goals",
    content:
      "The Polish striker reached 200 career club goals across LaLiga, Bundesliga and Champions League with tonight's opener at Camp Nou. He's now Barca's top scorer this season with 14.",
    category: "barca",
    createdAt: ago(34),
    slug: "lewandowski-200-club-goals",
  },
  {
    id: "3",
    title: "Yamal extends contract through 2030",
    content:
      "Lamine Yamal has signed a five-year extension. Release clause raised to €1B. Club source: 'He's our generation's project.'",
    category: "barca",
    createdAt: ago(120),
    slug: "yamal-extends-contract-2030",
  },
  {
    id: "4",
    title: "World Cup draw: Argentina-Brazil in Group B",
    content:
      "FIFA confirmed the group stage. Group of death lands in B with Argentina, Brazil, Croatia and Senegal. Tournament kicks off in three weeks.",
    category: "fifa",
    createdAt: ago(45),
    slug: "world-cup-draw-argentina-brazil-group-b",
  },
  {
    id: "5",
    title: "Mbappé fit to start France opener",
    content:
      "After last week's scare, Kylian Mbappé trained with the full squad on Tuesday. Deschamps confirms he starts vs Germany.",
    category: "fifa",
    createdAt: ago(180),
    slug: "mbappe-fit-france-opener",
  },
  {
    id: "6",
    title: "Pedri: 'Clásico is everything to us'",
    content:
      "Speaking from Ciudad Deportiva, Pedri said the team is 'switched on' for tonight's Clásico. 'Three points is all that matters. We owe the fans.'",
    category: "barca",
    createdAt: ago(240),
    slug: "pedri-clasico-everything",
  },
  {
    id: "7",
    title: "Group stage schedule released",
    content:
      "Full match calendar for the World Cup group stage is live. 48 matches across 12 days. Knockouts begin June 28.",
    category: "fifa",
    createdAt: ago(360),
    slug: "world-cup-group-stage-schedule",
  },
];

export async function listNews(category?: Competition, limit = 20): Promise<NewsPost[]> {
  const filtered = category ? POSTS.filter((p) => p.category === category) : POSTS;
  return [...filtered]
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, limit);
}

export async function getNewsBySlug(slug: string): Promise<NewsPost | null> {
  return POSTS.find((p) => p.slug === slug) ?? null;
}

export function createPost(input: {
  title: string;
  content: string;
  category: Competition;
}): NewsPost {
  const post: NewsPost = {
    id: String(POSTS.length + 1),
    slug: toSlug(input.title),
    title: input.title,
    content: input.content,
    category: input.category,
    createdAt: new Date().toISOString(),
  };
  POSTS.unshift(post);
  return post;
}
