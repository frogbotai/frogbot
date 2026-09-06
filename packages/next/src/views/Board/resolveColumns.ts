import { formatDate } from '@payloadcms/ui/shared';
import type { Field, PayloadRequest } from 'payload';

import { getBoardColumnKey, getBoardColumnValue } from './data.js';

export type ResolvedBoardColumn = { key: string; label: string; value: unknown };

const supportedFieldTypes: Field['type'][] = [
  'text',
  'textarea',
  'number',
  'select',
  'relationship',
  'date',
  'checkbox',
  'radio',
  'email',
  'upload',
];

export function resolveBoardField(fields: Field[], path: string): Field | undefined {
  const [name, ...rest] = path.split('.');
  const field = fields.find((candidate) => 'name' in candidate && candidate.name === name);
  if (!field) return undefined;
  if (rest.length === 0) return supportedFieldTypes.includes(field.type) ? field : undefined;
  if (!('fields' in field) || !Array.isArray(field.fields)) return undefined;
  return resolveBoardField(field.fields, rest.join('.'));
}

export async function resolveColumns({
  collectionSlug,
  field,
  path,
  req,
}: {
  collectionSlug: string;
  field: Field;
  path: string;
  req: PayloadRequest;
}): Promise<ResolvedBoardColumn[]> {
  if (field.type === 'select' || field.type === 'radio') {
    return field.options.map((option) =>
      typeof option === 'string'
        ? { key: getBoardColumnKey(option), label: option, value: option }
        : {
            key: getBoardColumnKey(option.value),
            label: String(option.label),
            value: option.value,
          },
    );
  }
  let populate: Record<string, Record<string, true>> | undefined;
  if (field.type === 'relationship' || field.type === 'upload') {
    const relationTo = Array.isArray(field.relationTo) ? field.relationTo : [field.relationTo];
    populate = Object.fromEntries(
      relationTo.map((slug) => {
        const related = req.payload.config.collections.find(
          ({ slug: candidate }) => candidate === slug,
        );
        return [slug, { [related?.admin.useAsTitle ?? 'id']: true }];
      }),
    );
  }
  const result = await req.payload.findDistinct({
    collection: collectionSlug,
    depth: 1,
    field: path,
    overrideAccess: false,
    populate,
    req,
  });
  return (result.values ?? []).flatMap((entry) => {
    const populated = entry[path];
    const value = getBoardColumnValue(populated);
    if (value === null || value === undefined) return [];
    let label: string;
    if (field.type === 'relationship' || field.type === 'upload') {
      const relationship = populated as {
        id?: unknown;
        relationTo?: string;
        value?: Record<string, unknown>;
      };
      const document: Record<string, unknown> | undefined = relationship?.relationTo
        ? relationship.value
        : relationship;
      const relationTo = relationship?.relationTo ?? (field.relationTo as string);
      const related = req.payload.config.collections.find(({ slug }) => slug === relationTo);
      label = String(document?.[related?.admin.useAsTitle ?? 'id'] ?? value);
    } else if (field.type === 'date') {
      label = formatDate({
        date: String(value),
        i18n: req.i18n,
        pattern: req.payload.config.admin.dateFormat,
      });
    } else if (field.type === 'checkbox') {
      label = req.i18n.t(value === true ? 'general:true' : 'general:false');
    } else {
      label = String(value);
    }
    return [{ key: getBoardColumnKey(value), label, value }];
  });
}
