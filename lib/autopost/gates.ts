const BANNED_PHRASES: RegExp[] = [
  /\bas an ai\b/i,
  /\bas a language model\b/i,
  /\bi cannot\b/i,
  /\bi can't\b/i,
  /\bi'm sorry,? but\b/i,
];

export interface GateDiagnostics {
  wordCount?: number;
  missingEntities?: string[];
  duplicateOf?: string;
  bannedPhrase?: string;
}

export function explainWordCount(body: string, min = 600): { ok: boolean; count: number } {
  const cleaned = body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#*_>`~\[\]()!-]/g, " ");
  const count = cleaned.split(/\s+/).filter(Boolean).length;
  return { ok: count >= min, count };
}

export function wordCountGate(body: string, min = 600): boolean {
  return explainWordCount(body, min).ok;
}

export interface DuplicateTopicInput {
  newTitle: string;
  recentTitles: string[];
  newEntities: string[];
  recentEntities: string[];
}

export function duplicateTopicGate(input: DuplicateTopicInput): boolean {
  return explainDuplicateTopic(input).ok;
}

/** Returns ok=true if the topic is novel. On failure, `duplicateOf` is either
 *  the overlapping entity (lower-cased) or the recent title that tripped the
 *  Jaccard similarity check. */
export function explainDuplicateTopic(input: DuplicateTopicInput): {
  ok: boolean;
  duplicateOf?: string;
} {
  const recentLower = new Set(input.recentEntities.map((e) => e.toLowerCase()));
  const overlapping = input.newEntities.find((e) => recentLower.has(e.toLowerCase()));
  if (overlapping) return { ok: false, duplicateOf: overlapping.toLowerCase() };
  const newTokens = tokenize(input.newTitle);
  for (const t of input.recentTitles) {
    if (jaccard(newTokens, tokenize(t)) >= 0.5) return { ok: false, duplicateOf: t };
  }
  return { ok: true };
}

export function bannedPhrasesGate(body: string): boolean {
  if (BANNED_PHRASES.some((re) => re.test(body))) return false;
  return !hasRepeatedParagraph(body);
}

/** Returns the first matched banned phrase (the raw match text), or
 *  "repeated_paragraph" if a paragraph repeats verbatim, or null if clean. */
export function explainBannedPhrases(body: string): string | null {
  for (const re of BANNED_PHRASES) {
    const m = re.exec(body);
    if (m) return m[0];
  }
  if (hasRepeatedParagraph(body)) return "repeated_paragraph";
  return null;
}

export function explainEntityCoverage(input: { entities: string[]; body: string }): {
  ok: boolean;
  missing: string[];
} {
  const lowerBody = input.body.toLowerCase();
  const missing = input.entities.filter((e) => !lowerBody.includes(e.toLowerCase()));
  return { ok: missing.length === 0, missing };
}

export function entityCoverageGate(input: { entities: string[]; body: string }): boolean {
  return explainEntityCoverage(input).ok;
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
