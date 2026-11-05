import type { CollectionAccess } from 'frogbot';

import type { Scorer } from './scorers.js';
import { isScorer } from './scorers.js';

export type EvalsPluginOptions = {
  /** Scorers by name. A dataset picks which of them score its cases. */
  scorers: Record<string, Scorer>;
  /** Cases a run scores at once. Default `5`. */
  concurrency?: number;
  /** Access for the four collections. None by default: set your own. */
  access?: CollectionAccess;
};

export type EvalsResolvedOptions = EvalsPluginOptions & { concurrency: number };

export function resolveOptions(options: EvalsPluginOptions): EvalsResolvedOptions {
  const entries = Object.entries(options?.scorers ?? {});

  if (entries.length === 0) throw new Error('[plugin-evals] scorers needs at least one scorer.');

  for (const [name, scorer] of entries) {
    if (!isScorer(scorer)) {
      throw new Error(
        `[plugin-evals] Scorer '${name}' must come from defineScorer(), judge() or checks.`,
      );
    }
  }

  const concurrency = options.concurrency ?? 5;

  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error('[plugin-evals] concurrency must be a positive integer.');
  }

  return { ...options, concurrency };
}
