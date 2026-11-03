import type { ImportBeforeHook } from '@payloadcms/plugin-import-export/types';
import type { FlattenedField, PayloadRequest, RelationshipField } from 'payload';

import { previewRelationship, resolveRelationship } from '../relationships.js';
import type { ImportColumn } from './columnMap.js';
import { columnMapFieldName, readColumnMap } from './columnMap.js';

/** The row key that carries a lookup failure to the row's create or update, which then fails. */
export const importErrorKey = '__frogbotImportError';

type Row = Record<string, unknown>;

type SingleRelationshipField = RelationshipField & { relationTo: string };

type RewriteContext = {
  fields: FlattenedField[];
  format: string;
  preview: boolean;
  req: PayloadRequest;
};

/**
 * Builds the batch `hooks.before` that rewrites rows from the import's stored `columnMap`: renamed
 * columns are read from the raw row, relationship cells are linked by their match-by field, and
 * unmapped columns are dropped. Without a `columnMap` the rows pass through untouched.
 */
export function createColumnRewrite(collectionSlug: string): ImportBeforeHook {
  return async ({ data, format, importDoc, originalData, req }) => {
    const columnMap = readColumnMap(importDoc[columnMapFieldName]);

    if (!columnMap) return data;

    const fields = req.payload.collections[collectionSlug]?.config.flattenedFields ?? [];

    const context: RewriteContext = { fields, format, preview: importDoc.id === undefined, req };

    const rawRows = alignRawRows(importDoc, data, originalData, format);

    const rows: Row[] = [];

    for (const [index, row] of (data as Row[]).entries()) {
      rows.push(await rewriteRow(row, rawRows[index], columnMap.columns, context));
    }

    return rows;
  };
}

async function rewriteRow(
  row: Row,
  raw: Row | undefined,
  columns: ImportColumn[],
  context: RewriteContext,
): Promise<Row> {
  let result: Row = {};

  const errors: string[] = [];

  const mapped = columns.filter((column): column is ImportColumn & { field: string } =>
    Boolean(column.field),
  );

  const [identity, renamed] = partition(mapped, (column) => isIdentity(column, context));

  if (!raw && renamed.length > 0) return { [importErrorKey]: unalignedRowMessage };

  for (const column of identity) {
    const key = rowKey(column.header, context.format);

    if (key in row) result[key] = row[key];
  }

  for (const column of renamed) {
    const value = raw![column.header];

    if (value === undefined) continue;

    const field = findField(context.fields, column.field);

    if (!isLookup(column, field)) {
      result = setPath(result, column.field, field ? coerce(field, value) : value);

      continue;
    }

    const linked = await linkCell(column, field, value, context);

    if ('error' in linked) {
      errors.push(linked.error);

      continue;
    }

    result = setPath(result, column.field, linked.value);
  }

  if (errors.length > 0) result[importErrorKey] = errors.join('; ');

  return result;
}

async function linkCell(
  column: ImportColumn & { field: string },
  field: SingleRelationshipField,
  value: unknown,
  context: RewriteContext,
): Promise<{ error: string } | { value: unknown }> {
  if (value === null) return { value: null };

  const values = field.hasMany ? toList(value) : [value];

  const linked: unknown[] = [];

  for (const item of values) {
    const args = {
      req: context.req,
      collection: field.relationTo,
      field: column.matchBy!,
      value: item,
      createMissing: column.createMissing === true,
    };

    try {
      linked.push(
        context.preview
          ? `${String(item)} · ${await previewRelationship(args)}`
          : await resolveRelationship(args),
      );
    } catch (error) {
      const message = `${column.header} "${String(item)}": ${errorMessage(error)}`;

      if (!context.preview) return { error: message };

      linked.push(message);
    }
  }

  return { value: field.hasMany ? linked : linked[0] };
}

function isIdentity(column: ImportColumn & { field: string }, context: RewriteContext): boolean {
  const sameKey =
    column.header === column.field || column.header === column.field.replaceAll('.', '_');

  if (!sameKey) return false;

  if (!findField(context.fields, rowKey(column.header, context.format))) return false;

  const field = findField(context.fields, column.field);

  return !isLookup(column, field) || column.matchBy === 'id';
}

function isLookup(
  column: ImportColumn,
  field: FlattenedField | undefined,
): field is SingleRelationshipField {
  return (
    field?.type === 'relationship' &&
    typeof field.relationTo === 'string' &&
    typeof column.matchBy === 'string'
  );
}

function rowKey(header: string, format: string): string {
  return format === 'csv' && !header.startsWith('_') ? header.split('_')[0] : header;
}

/** Finds a top-level, group or named-tab field by its dotted path. */
export function findField(fields: FlattenedField[], path: string): FlattenedField | undefined {
  const [name, ...rest] = path.split('.');

  const field = fields.find((candidate) => 'name' in candidate && candidate.name === name);

  if (!field || rest.length === 0) return field;

  return field.type === 'group' || field.type === 'tab'
    ? findField(field.flattenedFields, rest.join('.'))
    : undefined;
}

function coerce(field: FlattenedField, value: unknown): unknown {
  if (!('hasMany' in field) || !field.hasMany || value === null) return value;

  const list = toList(value);

  return field.type === 'number' ? list.map(Number) : list;
}

function toList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;

  if (typeof value !== 'string') return [value];

  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');
}

function setPath(target: Row, path: string, value: unknown): Row {
  const [key, ...rest] = path.split('.');

  if (rest.length === 0) return { ...target, [key]: value };

  const child = target[key];

  const nested = typeof child === 'object' && child !== null ? (child as Row) : {};

  return { ...target, [key]: setPath(nested, rest.join('.'), value) };
}

const unalignedRowMessage =
  'This row could not be lined up with the file because of an empty row above it. Remove the empty rows and import the file again.';

type Alignment = { kept: Row[]; offset: number };

const alignments = new WeakMap<object, Alignment>();

function alignRawRows(
  importDoc: object,
  data: unknown[],
  originalData: Row[],
  format: string,
): (Row | undefined)[] {
  if (format !== 'csv') return originalData;

  const alignment = alignments.get(importDoc) ?? { kept: [], offset: 0 };

  alignments.set(importDoc, alignment);

  alignment.kept.push(
    ...originalData.filter((row) => Object.values(row).some((value) => value !== undefined)),
  );

  const rows = data.map((_, index) => alignment.kept[alignment.offset + index]);

  alignment.offset += data.length;

  return rows;
}

function partition<T>(items: T[], test: (item: T) => boolean): [T[], T[]] {
  return [items.filter(test), items.filter((item) => !test(item))];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
