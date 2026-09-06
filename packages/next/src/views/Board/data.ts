export function getBoardGroupBy(groupBy?: string): string | undefined {
  return groupBy?.replace(/^-/, '') || undefined;
}

export type SortRow = {
  direction: 'asc' | 'desc';
  field: string;
};

export function parseSort(sort?: string | string[]): SortRow[] {
  return (Array.isArray(sort) ? sort.join(',') : (sort ?? ''))
    .split(',')
    .filter(Boolean)
    .map((value) => ({
      direction: value.startsWith('-') ? 'desc' : 'asc',
      field: value.replace(/^-/, ''),
    }));
}

export function serializeSort(rows: SortRow[]): string {
  return rows.map(({ direction, field }) => `${direction === 'desc' ? '-' : ''}${field}`).join(',');
}

export function syncSortRows(rows: SortRow[], sort?: string | string[]): SortRow[] {
  const nextRows = parseSort(sort);
  return serializeSort(rows.filter(({ field }) => field)) === serializeSort(nextRows)
    ? rows
    : [...nextRows, ...rows.filter(({ field }) => !field)];
}

export function resolveBoardSort({
  defaultSort,
  preferenceSort,
  querySort,
}: {
  defaultSort?: string | string[];
  preferenceSort?: string;
  querySort?: string | string[];
}): string | undefined {
  const sort = querySort ?? preferenceSort ?? defaultSort;
  return Array.isArray(sort) ? sort.join(',') : sort;
}

export function getBoardPreferenceKey(collectionSlug: string, viewSlug: string): string {
  return `collection-${collectionSlug}-view-${viewSlug}`;
}

export function resolveBoardGroupBy({
  configuredGroupBy,
  hasQueryGroupBy,
  preferenceGroupBy,
  queryGroupBy,
}: {
  configuredGroupBy?: string;
  hasQueryGroupBy: boolean;
  preferenceGroupBy?: string;
  queryGroupBy?: string;
}): string {
  if (hasQueryGroupBy) return queryGroupBy ?? '';
  if (preferenceGroupBy !== undefined) return preferenceGroupBy;
  return configuredGroupBy ?? '';
}

export function getBoardPreferenceUpdate(
  collectionSlug: string,
  viewSlug: string,
  value: string | { groupBy?: string; sort?: string },
): [string, { groupBy?: string; sort?: string }, true] {
  return [
    getBoardPreferenceKey(collectionSlug, viewSlug),
    typeof value === 'string' ? { groupBy: value } : value,
    true,
  ];
}

export function getPath(value: Record<string, unknown>, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (current, key) =>
        current && typeof current === 'object'
          ? (current as Record<string, unknown>)[key]
          : undefined,
      value,
    );
}

export function getPathField<T extends { name?: string; fields?: T[] }>(
  fields: T[],
  path: string,
): T | undefined {
  const [name, ...rest] = path.split('.');
  const field = fields.find((candidate) => candidate.name === name);
  return field && rest.length > 0 && Array.isArray(field.fields)
    ? getPathField(field.fields, rest.join('.'))
    : field;
}

export function setPath(path: string, value: unknown): Record<string, unknown> {
  const keys = path.split('.');
  return keys.reduceRight<Record<string, unknown>>(
    (result, key) => ({ [key]: result }),
    value as never,
  );
}

export function getBoardColumnKey(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'object') {
    const relationship = value as { id?: unknown; relationTo?: unknown; value?: unknown };
    if (relationship.relationTo && relationship.value !== undefined) {
      const relatedValue = relationship.value;
      const id =
        relatedValue && typeof relatedValue === 'object'
          ? (relatedValue as { id?: unknown }).id
          : relatedValue;
      return `relationship:${String(relationship.relationTo)}:${getBoardColumnKey(id)}`;
    }
    if (relationship.id !== undefined) return `relationship:${getBoardColumnKey(relationship.id)}`;
  }
  return `${typeof value}:${String(value)}`;
}

export function getBoardColumnValue(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const relationship = value as { id?: unknown; relationTo?: unknown; value?: unknown };
  if (relationship.relationTo && relationship.value !== undefined) {
    const relatedValue = relationship.value;
    return {
      relationTo: relationship.relationTo,
      value:
        relatedValue && typeof relatedValue === 'object'
          ? (relatedValue as { id?: unknown }).id
          : relatedValue,
    };
  }
  return relationship.id ?? value;
}

export function buildColumnWhere(
  where: unknown,
  groupBy: string,
  value: unknown,
): Record<string, unknown> {
  const group = {
    [groupBy]: value === null || value === undefined ? { exists: false } : { equals: value },
  };
  return where && typeof where === 'object' && Object.keys(where).length > 0
    ? { and: [where, group] }
    : group;
}

export function appendQuery(params: URLSearchParams, key: string, value: unknown): void {
  if (value === undefined || value === null || value === '') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => appendQuery(params, `${key}[${index}]`, item));
    return;
  }
  if (typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([child, item]) =>
      appendQuery(params, `${key}[${child}]`, item),
    );
    return;
  }
  params.set(key, String(value));
}
