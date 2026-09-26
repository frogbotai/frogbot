import type { SearchMetric } from 'frogbot/search';

export function buildVectorScore({
  metric,
  score,
}: {
  metric: SearchMetric;
  score: unknown;
}): Record<string, unknown> {
  if (metric === 'euclidean') return { $subtract: [{ $divide: [1, score] }, 1] };

  return { $subtract: [{ $multiply: [2, score] }, 1] };
}
