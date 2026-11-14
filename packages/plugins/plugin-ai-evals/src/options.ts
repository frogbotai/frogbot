import type { CollectionAccess } from 'frogbot';

import type { Scorer } from './scorers.js';
import { isScorer } from './scorers.js';

export type AIEvalsPluginOptions = {
  /** Scorers by name. A dataset picks which of them score its cases. */
  scorers: Record<string, Scorer>;
  /** Cases a run scores at once. Default `5`. */
  concurrency?: number;
  /** Access for the four collections. None by default: set your own. */
  access?: CollectionAccess;
};

export type EvalsResolvedOptions = AIEvalsPluginOptions & { concurrency: number };

export function resolveOptions(options: AIEvalsPluginOptions): EvalsResolvedOptions {
  const entries = Object.entries(options?.scorers ?? {});

  if (entries.length === 0) throw new Error('[plugin-ai-evals] scorers needs at least one scorer.');

  for (const [name, scorer] of entries) {
    if (!isScorer(scorer)) {
      throw new Error(
        `[plugin-ai-evals] Scorer '${name}' must come from defineScorer(), judge() or checks.`,
      );
    }
  }

  const concurrency = options.concurrency ?? 5;

  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error('[plugin-ai-evals] concurrency must be a positive integer.');
  }

  return { ...options, concurrency };
}
