const BANNED_PHRASES: RegExp[] = [
  /\bas an ai\b/i,
  /\bas a language model\b/i,
  /\bi cannot\b/i,
  /\bi can't\b/i,
  /\bi'm sorry,? but\b/i,
];

export function wordCountGate(body: string, min = 600): boolean {
  const cleaned = body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#*_>`~\[\]()!-]/g, " ");
  const words = cleaned.split(/\s+/).filter(Boolean);
  return words.length >= min;
}

export interface DuplicateTopicInput {
  newTitle: string;
  recentTitles: string[];
  newEntities: string[];
  recentEntities: string[];
}

export function duplicateTopicGate(input: DuplicateTopicInput): boolean {
  // Normalize both sides so callers can pass entities at any casing.
  const recentLower = new Set(input.recentEntities.map((e) => e.toLowerCase()));
  const overlap = input.newEntities.some((e) => recentLower.has(e.toLowerCase()));
  if (overlap) return false;
  const newTokens = tokenize(input.newTitle);
  for (const t of input.recentTitles) {
    if (jaccard(newTokens, tokenize(t)) >= 0.5) return false;
  }
  return true;
}

export function bannedPhrasesGate(body: string): boolean {
  if (BANNED_PHRASES.some((re) => re.test(body))) return false;
  return !hasRepeatedParagraph(body);
}

export function entityCoverageGate(input: { entities: string[]; body: string }): boolean {
  const lowerBody = input.body.toLowerCase();
  return input.entities.every((e) => lowerBody.includes(e.toLowerCase()));
}

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function hasRepeatedParagraph(body: string): boolean {
  const paras = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.split(/\s+/).length >= 20);
  const seen = new Set<string>();
  for (const p of paras) {
    const key = p.replace(/\s+/g, " ");
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}
