import { createHash } from 'node:crypto';

/** Two memories whose word sets overlap at least this much are near duplicates. */
export const NEAR_DUPLICATE_SIMILARITY = 0.9;

const MAX_QUERY_WORDS = 32;

/** Lowercase, punctuation stripped, whitespace collapsed. */
export function normalizeMemoryText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function memoryWords(text: string): string[] {
  const normalized = normalizeMemoryText(text);

  return normalized ? [...new Set(normalized.split(' '))] : [];
}

export function memoryFingerprint(text: string): string {
  return createHash('sha256').update(normalizeMemoryText(text)).digest('hex');
}

/** A lexical query that matches any of the words, so a near duplicate or a loose question still finds a memory. */
export function anyWordQuery(text: string): string | undefined {
  const words = memoryWords(text)
    .filter((word) => word !== 'or')
    .slice(0, MAX_QUERY_WORDS);

  return words.length ? words.join(' or ') : undefined;
}

/** Word-set Jaccard similarity, from 0 to 1. */
export function memorySimilarity(a: string, b: string): number {
  const left = new Set(memoryWords(a));
  const right = new Set(memoryWords(b));

  if (!left.size || !right.size) return 0;

  let shared = 0;

  for (const word of left) if (right.has(word)) shared++;

  return shared / (left.size + right.size - shared);
}
