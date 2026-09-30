export type ModelSearchValue = {
  normalized: string;
  compact: string;
};

export function normalizeModelSearch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function compactModelSearch(value: string): string {
  return normalizeModelSearch(value).replaceAll(' ', '');
}

export function matchesModelSearch(query: string, values: readonly ModelSearchValue[]): boolean {
  const normalized = normalizeModelSearch(query);

  if (!normalized) return true;

  const compact = compactModelSearch(normalized);

  return values.some(
    (value) => value.normalized.includes(normalized) || value.compact.includes(compact),
  );
}
