import type { FlattenedField, PayloadRequest } from 'payload';
import { toWords } from 'payload/shared';

import type { ImportColumn } from './columnMap.js';

/** A field on the related collection that a relationship cell can be matched against. */
export type ImportMatchByOption = { field: string; label: string };

/** A field a file column can import into. */
export type ImportTarget = {
  /** The field's path, such as `name` or `details.city`. */
  field: string;
  /** The field's label, with its group's label first for a nested field. */
  label: string;
  type: FlattenedField['type'];
  hasMany: boolean;
  /** For a single-collection relationship: the related collection and how to match its records. */
  relationship?: {
    collection: string;
    matchBy: ImportMatchByOption[];
    /** The related collection's `useAsTitle` when it can be matched by, else `id`. */
    defaultMatchBy: string;
  };
};

const valueTypes = new Set<FlattenedField['type']>([
  'checkbox',
  'code',
  'date',
  'email',
  'json',
  'number',
  'radio',
  'select',
  'text',
  'textarea',
]);

const matchByTypes = new Set<FlattenedField['type']>(['email', 'text']);

/**
 * Lists the fields of `collectionSlug` that a column can map to: top-level and group fields of a
 * plain value type, and single-collection relationships with their match-by options.
 */
export function listImportTargets(req: PayloadRequest, collectionSlug: string): ImportTarget[] {
  const fields = req.payload.collections[collectionSlug]?.config.flattenedFields ?? [];

  return collectTargets(req, fields, undefined);
}

function collectTargets(
  req: PayloadRequest,
  fields: FlattenedField[],
  parent: { field: string; label: string } | undefined,
): ImportTarget[] {
  return fields.flatMap((field): ImportTarget[] => {
    if (!('name' in field) || field.hidden || ('virtual' in field && field.virtual)) return [];

    const path = parent ? `${parent.field}.${field.name}` : field.name;
    const label = parent ? `${parent.label} › ${labelOf(req, field)}` : labelOf(req, field);

    if (field.type === 'group' || field.type === 'tab') {
      return collectTargets(req, field.flattenedFields, { field: path, label });
    }

    const hasMany = 'hasMany' in field && field.hasMany === true;

    if (field.type === 'relationship') {
      if (typeof field.relationTo !== 'string') return [];

      const relationship = relationshipTarget(req, field.relationTo);

      return relationship ? [{ field: path, label, type: field.type, hasMany, relationship }] : [];
    }

    return valueTypes.has(field.type) ? [{ field: path, label, type: field.type, hasMany }] : [];
  });
}

function relationshipTarget(
  req: PayloadRequest,
  collection: string,
): ImportTarget['relationship'] | undefined {
  const config = req.payload.collections[collection]?.config;

  if (!config) return undefined;

  const matchBy: ImportMatchByOption[] = [
    ...config.flattenedFields
      .filter((field) => matchByTypes.has(field.type) && !('hidden' in field && field.hidden))
      .map((field) => ({ field: (field as { name: string }).name, label: labelOf(req, field) })),
    { field: 'id', label: 'ID' },
  ];

  const title = config.admin.useAsTitle;

  return {
    collection,
    matchBy,
    defaultMatchBy: title && matchBy.some(({ field }) => field === title) ? title : 'id',
  };
}

/**
 * Starts a mapping from header names. A header that is a FrogBot export key maps to itself (a
 * relationship key keeps match by ID); otherwise a header that matches one field's name or label,
 * ignoring case, spaces, `_`, `-` and `.`, maps to it. Every other column starts as "Skip".
 */
export function suggestColumns({
  headers,
  targets,
  fields,
}: {
  headers: string[];
  targets: ImportTarget[];
  fields: FlattenedField[];
}): ImportColumn[] {
  const used = new Set<string>();

  const exact = headers.map((header) => exactColumn(header, targets, fields));

  for (const column of exact) {
    if (column?.field) used.add(column.field);
  }

  return headers.map((header, index) => {
    const known = exact[index];

    if (known) return known;

    const target = nameMatch(header, targets, used);

    if (!target) return { header, field: null };

    used.add(target.field);

    return toColumn(header, target);
  });
}

/**
 * Keeps the columns of a stored or suggested mapping that still fit: one per header, in header
 * order, with a field the collection still has and a match-by its relationship still offers.
 */
export function sanitizeColumns({
  headers,
  columns,
  targets,
  fields,
}: {
  headers: string[];
  columns: ImportColumn[];
  targets: ImportTarget[];
  fields: FlattenedField[];
}): ImportColumn[] {
  const byHeader = new Map(columns.map((column) => [column.header.trim(), column]));

  return headers.map((header) => {
    const column = byHeader.get(header.trim());

    if (!column?.field) return { header, field: null };

    const target = targets.find(({ field }) => field === column.field);

    if (!target) {
      return column.field === header && isExportKey(header, fields)
        ? { header, field: header }
        : { header, field: null };
    }

    if (!target.relationship) return { header, field: target.field };

    const matchBy = target.relationship.matchBy.some(({ field }) => field === column.matchBy)
      ? column.matchBy!
      : target.relationship.defaultMatchBy;

    return {
      header,
      field: target.field,
      matchBy,
      createMissing: column.createMissing === true && matchBy !== 'id',
    };
  });
}

function exactColumn(
  header: string,
  targets: ImportTarget[],
  fields: FlattenedField[],
): ImportColumn | undefined {
  const target = targets.find(
    ({ field }) => field === header || field.replaceAll('.', '_') === header,
  );

  if (target) {
    return target.relationship
      ? { header, field: target.field, matchBy: 'id' }
      : { header, field: target.field };
  }

  return isExportKey(header, fields) ? { header, field: header } : undefined;
}

function isExportKey(header: string, fields: FlattenedField[]): boolean {
  if (header === 'id') return true;

  const name = header.startsWith('_') ? header : header.split('_')[0];

  return fields.some((field) => 'name' in field && field.name === name);
}

function nameMatch(
  header: string,
  targets: ImportTarget[],
  used: Set<string>,
): ImportTarget | undefined {
  const key = normalize(header);

  const free = targets.filter(({ field }) => !used.has(field));

  const byName = free.filter(({ field }) => normalize(field) === key);

  if (byName.length > 0) return byName.length === 1 ? byName[0] : undefined;

  const byLabel = free.filter((target) => labelKeys(target).includes(key));

  return byLabel.length === 1 ? byLabel[0] : undefined;
}

function labelKeys({ label }: ImportTarget): string[] {
  const parts = label.split(' › ');

  return [normalize(parts.join(' ')), normalize(parts.at(-1)!)];
}

export function toColumn(header: string, target: ImportTarget): ImportColumn {
  return target.relationship
    ? {
        header,
        field: target.field,
        matchBy: target.relationship.defaultMatchBy,
        createMissing: false,
      }
    : { header, field: target.field };
}

/** Lower case, without spaces, `_`, `-` or `.`, so "Full Name", "full_name" and "fullName" agree. */
export function normalize(value: string): string {
  return value.toLowerCase().replaceAll(/[\s_.-]/g, '');
}

function labelOf(req: PayloadRequest, field: FlattenedField): string {
  const name = 'name' in field ? field.name : '';
  const label = 'label' in field ? field.label : undefined;

  if (typeof label === 'string') return label;

  if (typeof label === 'function') return label({ i18n: req.i18n, t: req.t });

  if (label && typeof label === 'object') {
    return label[req.i18n?.language] ?? Object.values(label)[0] ?? toWords(name);
  }

  return toWords(name);
}
