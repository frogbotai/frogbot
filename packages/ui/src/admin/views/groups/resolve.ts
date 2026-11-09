import { getTranslation } from '@payloadcms/translations';
import { formatDate } from '@payloadcms/ui/shared';
import { GROUP_BY_FIELD_TYPES, type OptionColor } from 'frogbot';
import type { Field, PayloadRequest, PopulateType, SelectIncludeType, Where } from 'payload';
import { fieldIsVirtual, flattenTopLevelFields } from 'payload/shared';

import { getOptionColor } from '../../fields/optionColor.js';
import { getPath, toCellData } from '../cells.js';
import { getGroupKey } from './keys.js';

/** One group of a list or one board column: its key, label, option colour and stored value. */
export type ResolvedGroup = {
  color?: OptionColor;
  key: string;
  label: string;
  value: unknown;
};

function isGroupable(field: Field): boolean {
  if ('access' in field && field.access?.read) return false;
  if ('hidden' in field && field.hidden === true) return false;

  return !fieldIsVirtual(field);
}

/**
 * The field at a dot path when a view can group by it, or `undefined`. Fields behind a read
 * access function, hidden or virtual fields, and polymorphic relationships are left to Payload's
 * own grouping, because their groups can't be counted.
 */
export function resolveGroupField(fields: Field[], path: string): Field | undefined {
  const [name, ...rest] = path.split('.');
  const field = (flattenTopLevelFields(fields) as Field[]).find(
    (candidate) => 'name' in candidate && candidate.name === name,
  );

  if (!field || !isGroupable(field)) return undefined;
  if (rest.length === 0) {
    if ('relationTo' in field && Array.isArray(field.relationTo)) return undefined;

    return GROUP_BY_FIELD_TYPES.includes(field.type) ? field : undefined;
  }

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
    const label = typeof option === 'string' ? option : getTranslation(option.label, req.i18n);
    const value = typeof option === 'string' ? option : option.value;
    const group: ResolvedGroup = {
      key: getGroupKey(value),
      label: typeof label === 'string' ? label : value,
      value,
    };

    const color = getOptionColor({ field, value: group.value });

    return color ? { color, ...group } : group;
  });
}

/** A `select` that reads one dot path. */
export function selectPath(path: string): SelectIncludeType {
  const [first, ...rest] = path.split('.');

  return { [first]: rest.length ? selectPath(rest.join('.')) : true };
}

function compareValues(a: unknown, b: unknown): number {
  const left = toCellData(a);
  const right = toCellData(b);

  if (typeof left === 'number' && typeof right === 'number') return left - right;

  const [x, y] = [String(left), String(right)];

  return x < y ? -1 : x > y ? 1 : 0;
}

async function findGroupValues({
  collectionSlug,
  depth = 0,
  draft,
  path,
  populate,
  req,
  where,
}: {
  collectionSlug: string;
  depth?: number;
  draft?: boolean;
  path: string;
  populate?: PopulateType;
  req: PayloadRequest;
  where?: Where;
}): Promise<unknown[]> {
  if (!draft) {
    const result = await req.payload.findDistinct({
      collection: collectionSlug,
      depth,
      field: path,
      overrideAccess: false,
      populate,
      req,
      ...(where ? { where } : {}),
    });

    return (result.values ?? []).map((entry) => entry[path]);
  }

  const { docs } = await req.payload.find({
    collection: collectionSlug,
    depth,
    draft: true,
    overrideAccess: false,
    pagination: false,
    populate,
    req,
    select: selectPath(path),
    ...(where ? { where } : {}),
  });

  const values = new Map<string, unknown>();

  for (const doc of docs as Record<string, unknown>[]) {
    const stored = getPath(doc, path);

    for (const value of Array.isArray(stored) ? stored : [stored]) {
      const key = getGroupKey(toCellData(value));
      if (!values.has(key)) values.set(key, value);
    }
  }

  return [...values.values()].sort(compareValues);
}

/**
 * The groups a field splits records into, "No value" aside. Select, radio and checkbox fields
 * give every option in its declared order; other fields give the values present under `where`.
 */
export async function resolveGroups({
  collectionSlug,
  draft,
  field,
  path,
  req,
  where,
}: {
  collectionSlug: string;
  /**
   * Read values from each record's latest draft, as a list's rows do on a drafts collection.
   * Payload's `findDistinct` reads published data only.
   */
  draft?: boolean;
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

  const values = await findGroupValues({
    collectionSlug,
    depth: 1,
    draft,
    path,
    populate,
    req,
    where,
  });

  return values.flatMap((populated) => {
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

/**
 * Groups for stored values of a select or radio field that are no longer among its options, so
 * their records still show in the list. Labelled with the raw value.
 */
export async function resolveStrayGroups({
  collectionSlug,
  draft,
  field,
  path,
  req,
  where,
}: {
  collectionSlug: string;
  /**
   * Read values from each record's latest draft, as a list's rows do on a drafts collection.
   * Payload's `findDistinct` reads published data only.
   */
  draft?: boolean;
  field: Field;
  path: string;
  req: PayloadRequest;
  where?: Where;
}): Promise<ResolvedGroup[]> {
  if (field.type !== 'select' && field.type !== 'radio') return [];

  const options = new Set(
    field.options.map((option) => getGroupKey(typeof option === 'string' ? option : option.value)),
  );

  const values = await findGroupValues({ collectionSlug, draft, path, req, where });

  return values.flatMap((stored) => {
    const value = toCellData(stored);
    if (value === null || value === undefined || options.has(getGroupKey(value))) return [];

    return [{ key: getGroupKey(value), label: String(value), value }];
  });
}
