import { estimateTokens } from '../chat/compaction/estimate.js';

/** The tokens a scope's pinned memories may hold, at save time and in the prompt. */
export const PINNED_TOKEN_BUDGET = 2_000;

/** A memory's token estimate. Every memory counts at least one token. */
export function memoryTokens(text: string): number {
  return Math.max(1, estimateTokens(text));
}
