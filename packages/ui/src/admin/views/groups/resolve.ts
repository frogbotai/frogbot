import { formatDate } from '@payloadcms/ui/shared';
import { GROUP_BY_FIELD_TYPES, type OptionColor } from 'frogbot';
import type { Field, PayloadRequest, Where } from 'payload';
import { flattenTopLevelFields } from 'payload/shared';

import { getOptionColor } from '../../fields/optionColor.js';
import { toCellData } from '../cells.js';
import { getGroupKey } from './keys.js';

/** One group of a list or one board column: its key, label, option colour and stored value. */
export type ResolvedGroup = {
  color?: OptionColor;
  key: string;
  label: string;
  value: unknown;
};

/** The field at a dot path when a view can group by it, or `undefined`. */
export function resolveGroupField(fields: Field[], path: string): Field | undefined {
  const [name, ...rest] = path.split('.');
  const field = (flattenTopLevelFields(fields) as Field[]).find(
    (candidate) => 'name' in candidate && candidate.name === name,
  );

  if (!field) return undefined;
  if (rest.length === 0) return GROUP_BY_FIELD_TYPES.includes(field.type) ? field : undefined;
  if (!('fields' in field) || !Array.isArray(field.fields)) return undefined;

  return resolveGroupField(field.fields, rest.join('.'));
}

/** Whether a field's groups are its options, shown even when empty, rather than the values present. */
export function hasFixedGroups(field: Field): boolean {
  return field.type === 'select' || field.type === 'radio' || field.type === 'checkbox';
}

function optionGroups(field: Field, req: PayloadRequest): ResolvedGroup[] | undefined {
  if (field.type === 'checkbox') {
    return [true, false].map((value) => ({
      key: getGroupKey(value),
      label: req.i18n.t(value ? 'general:true' : 'general:false'),
      value,
    }));
  }

  if (field.type !== 'select' && field.type !== 'radio') return undefined;

  return field.options.map((option) => {
    const group: ResolvedGroup =
      typeof option === 'string'
        ? { key: getGroupKey(option), label: option, value: option }
        : { key: getGroupKey(option.value), label: String(option.label), value: option.value };

    const color = getOptionColor({ field, value: group.value });

    return color ? { color, ...group } : group;
  });
}

/**
 * The groups a field splits records into, "No value" aside. Select, radio and checkbox fields
 * give every option in its declared order; other fields give the values present under `where`.
 */
export async function resolveGroups({
  collectionSlug,
  field,
  path,
  req,
  where,
}: {
  collectionSlug: string;
  field: Field;
  path: string;
  req: PayloadRequest;
  where?: Where;
}): Promise<ResolvedGroup[]> {
  const options = optionGroups(field, req);
  if (options) return options;

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
    ...(where ? { where } : {}),
  });

  return (result.values ?? []).flatMap((entry) => {
    const populated = entry[path];
    const value = toCellData(populated);
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
    } else {
      label = String(value);
    }

    return [{ key: getGroupKey(value), label, value }];
  });
}
