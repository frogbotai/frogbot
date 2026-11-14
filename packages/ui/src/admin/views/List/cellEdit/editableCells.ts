import type { PayloadRequest, SanitizedCollectionConfig, Where } from 'payload';

import { type AnyField, readField, resolveFieldAtPath } from './fieldPath.js';

type Row = Record<string, unknown>;

type UpdateAccess = (args: {
  collection: SanitizedCollectionConfig;
  data: Row;
  doc: Row;
  id: number | string;
  req: PayloadRequest;
}) => boolean | Promise<boolean>;

function isId(id: unknown): id is number | string {
  return typeof id === 'number' || typeof id === 'string';
}

function fieldUpdateAccess(fields: readonly AnyField[], path: string): UpdateAccess[] {
  const found = resolveFieldAtPath(fields, path);

  return found
    ? [...found.parents, readField(found.field)].flatMap(({ access }) =>
        typeof access?.update === 'function' ? [access.update as UpdateAccess] : [],
      )
    : [];
}

/**
 * The columns each row can edit, when that depends on the record: a collection `access.update`
 * that returns a query, or a field `access.update` (on the field or a group above it), runs per
 * record, the way the edit page checks it. `undefined` when every row edits every column.
 */
export async function findEditableCells({
  collectionConfig,
  columns,
  docs,
  req,
}: {
  collectionConfig: SanitizedCollectionConfig;
  columns: string[];
  docs: Row[];
  req: PayloadRequest;
}): Promise<Record<string, string[]> | undefined> {
  const ids = docs.map(({ id }) => id).filter(isId);

  if (!columns.length || !ids.length) return undefined;

  const checks = columns.map((path) => ({
    access: fieldUpdateAccess(collectionConfig.fields, path),
    path,
  }));

  const byField = checks.some(({ access }) => access.length > 0);
  const byRow: boolean | Where = await collectionConfig.access.update({
    req,
    slug: collectionConfig.slug,
  });

  if (byRow === true && !byField) return undefined;

  const cells: Record<string, string[]> = Object.fromEntries(ids.map((id) => [String(id), []]));

  if (!byRow) return cells;

  const inPage: Where = { id: { in: ids } };
  const { docs: records } = await req.payload.find({
    collection: collectionConfig.slug,
    depth: 0,
    draft: Boolean(collectionConfig.versions?.drafts),
    limit: ids.length,
    overrideAccess: true,
    pagination: false,
    req,
    where: byRow === true ? inPage : { and: [inPage, byRow] },
  });

  await Promise.all(
    (records as Row[]).map(async (record) => {
      if (!isId(record.id)) return;
      const { id } = record;

      const allowed = await Promise.all(
        checks.map(async ({ access, path }) => {
          for (const update of access) {
            if (
              !(await update({ collection: collectionConfig, data: record, doc: record, id, req }))
            ) {
              return undefined;
            }
          }

          return path;
        }),
      );

      cells[String(id)] = allowed.filter((path) => path !== undefined);
    }),
  );

  return cells;
}
