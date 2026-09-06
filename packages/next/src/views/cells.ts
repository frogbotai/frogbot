export function toCellData(value: unknown): unknown {
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

export function setPath(path: string, value: unknown): Record<string, unknown> {
  return path
    .split('.')
    .reduceRight<Record<string, unknown>>((result, key) => ({ [key]: result }), value as never);
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
