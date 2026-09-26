export const maxNumCandidates = 10000;

export function isApproximateVectorSearch({
  approximate,
  limit,
}: {
  approximate: boolean;
  limit: number;
}): boolean {
  return approximate && limit <= maxNumCandidates;
}

export function buildVectorSearchStage({
  approximate,
  candidates,
  filter,
  limit,
  name,
  path,
  vector,
}: {
  approximate: boolean;
  candidates: number;
  filter?: Record<string, unknown>;
  limit: number;
  name: string;
  path: string;
  vector: number[];
}): Record<string, unknown> {
  const breadth = isApproximateVectorSearch({ approximate, limit })
    ? { numCandidates: Math.min(Math.max(candidates, limit), maxNumCandidates) }
    : { exact: true };

  return {
    $vectorSearch: {
      index: name,
      path,
      queryVector: vector,
      limit,
      ...breadth,
      ...(filter ? { filter } : {}),
    },
  };
}
