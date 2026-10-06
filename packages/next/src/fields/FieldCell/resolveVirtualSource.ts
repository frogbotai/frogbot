import type { ClientCollectionConfig, ClientField, Field } from 'payload';
import { flattenAllFields } from 'payload/shared';

type FlattenedClientField = ClientField & { flattenedFields?: FlattenedClientField[] };

const sourceTypes = new Set([
  'checkbox',
  'date',
  'email',
  'number',
  'radio',
  'select',
  'text',
  'textarea',
]);

const noFields: ClientField[] = [];

function flatten(fields: ClientField[]): FlattenedClientField[] {
  return flattenAllFields({ cache: true, fields: fields as Field[] }) as FlattenedClientField[];
}

export function resolveVirtualSource({
  collectionSlug,
  getEntityConfig,
  path,
}: {
  collectionSlug: string;
  getEntityConfig: (args: { collectionSlug: string }) => ClientCollectionConfig | null | undefined;
  path: string;
}): ClientField | undefined {
  const segments = path.split('.');
  let fields = flatten(getEntityConfig({ collectionSlug })?.fields ?? noFields);

  for (const [index, segment] of segments.entries()) {
    const field = fields.find((candidate) => 'name' in candidate && candidate.name === segment);

    if (!field) return undefined;

    if (index === segments.length - 1) {
      return sourceTypes.has(field.type) && !('virtual' in field && field.virtual)
        ? field
        : undefined;
    }

    if (field.type === 'group' || (field.type as string) === 'tab') {
      fields = field.flattenedFields ?? [];

      continue;
    }

    if (
      (field.type === 'relationship' || field.type === 'upload') &&
      typeof field.relationTo === 'string'
    ) {
      const related = getEntityConfig({ collectionSlug: field.relationTo });

      if (!related) return undefined;

      fields = flatten(related.fields);

      continue;
    }

    return undefined;
  }

  return undefined;
}
