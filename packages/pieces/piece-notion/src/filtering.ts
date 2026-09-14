import { z } from 'zod';

import type { NotionClient } from './client.js';
import { hasValue } from './properties.js';

const databaseSchema = z
  .object({
    properties: z.record(z.string(), z.object({ type: z.string() }).passthrough()),
  })
  .passthrough();

export async function buildFilters({
  client,
  databaseId,
  fields,
  match,
  signal,
}: {
  client: NotionClient;
  databaseId: string;
  fields: Record<string, unknown>;
  match: 'contains' | 'equals';
  signal?: AbortSignal;
}) {
  const database = databaseSchema.parse(
    await client.request({ path: `/databases/${databaseId}`, signal }),
  );
  const filters: Record<string, unknown>[] = [];

  Object.entries(fields).forEach(([name, value]) => {
    if (!hasValue(value)) return;

    const type = database.properties[name]?.type;

    switch (type) {
      case 'title':
      case 'rich_text':
        filters.push({ property: name, [type]: { [match]: String(value) } });
        break;
      case 'number':
        filters.push({ property: name, number: { equals: Number(value) } });
        break;
      case 'select':
      case 'status':
      case 'email':
      case 'phone_number':
      case 'url':
      case 'date':
        filters.push({ property: name, [type]: { equals: String(value) } });
        break;
      case 'checkbox':
        filters.push({ property: name, checkbox: { equals: Boolean(value) } });
        break;
      case 'multi_select':
        (Array.isArray(value) ? value : [value]).forEach((item) => {
          filters.push({ property: name, multi_select: { contains: String(item) } });
        });
        break;
      case 'people':
        filters.push({ property: name, people: { contains: String(value) } });
        break;
    }
  });

  return filters;
}
