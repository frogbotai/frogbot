import { z } from 'zod';

/** A record as Salesforce returns it: field values by API name, plus `attributes`. */
export const sobject = z.record(z.string(), z.unknown());

/** `{ records, totalSize, done, nextRecordsUrl }`, with `nextRecordsUrl` `null` on the last page. */
export const queryPage = z
  .object({
    records: z.array(sobject),
    totalSize: z.number(),
    done: z.boolean(),
    nextRecordsUrl: z.string().nullish(),
  })
  .transform(({ nextRecordsUrl, ...page }) => ({
    ...page,
    nextRecordsUrl: nextRecordsUrl ?? null,
  }));

export const queryPageOutput = z.object({
  records: z.array(sobject),
  totalSize: z.number(),
  done: z.boolean(),
  nextRecordsUrl: z
    .string()
    .nullable()
    .meta({ description: 'Pass it back as nextRecordsUrl for the next page; null on the last.' }),
});

const saveError = z.object({
  statusCode: z.string().optional(),
  message: z.string(),
  fields: z.array(z.string()).optional(),
});

/** What creating a record returns. */
export const created = z.object({
  id: z.string(),
  success: z.boolean(),
  errors: z.array(saveError),
});

/** What an update or delete returns: the record's ID. */
export const changed = z.object({ id: z.string() });

/** One row of a composite upsert. */
export const upserted = z.object({
  id: z.string().nullish(),
  success: z.boolean(),
  created: z.boolean().optional(),
  errors: z.array(saveError),
});

/** Escapes a value for a quoted SOQL string literal. */
export function soqlString(value: string) {
  return `'${value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')}'`;
}

/** The given field values by API name, skipping the ones left out. */
export function fieldValues(
  values: Record<string, unknown>,
  names: Record<string, string>,
  extra: Record<string, unknown> = {},
) {
  return Object.fromEntries(
    [
      ...Object.entries(names).map(([key, name]) => [name, values[key]] as const),
      ...Object.entries(extra),
    ].filter(([, value]) => value !== undefined),
  );
}
