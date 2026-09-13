import { createHash } from 'node:crypto';

import { parse } from 'csv-parse/sync';
import { z } from 'zod';

import {
  batch,
  batchOutput,
  cells,
  columnIndex,
  mapRows,
  readInput,
  readRows,
  readValues,
  requestOptions,
  rowNumber,
  rowOutput,
  rowValues,
  sheetInput,
  sheetRange,
  type SheetsArgs,
  updatedRow,
  updateOutput,
  valueInputOption,
  worksheet,
} from './shared.js';

const writeInput = sheetInput.extend({ values: rowValues, valueInputOption });
const writeOutput = z.object({ row: rowNumber, updates: updateOutput });

async function appendValues(args: SheetsArgs<z.output<typeof writeInput>>) {
  const sheet = await worksheet(args);
  const { data } = await args.client.sheets.spreadsheets.values.append(
    {
      spreadsheetId: args.input.spreadsheetId,
      range: sheetRange(sheet.title!, 'A:A'),
      valueInputOption: args.input.valueInputOption,
      requestBody: { majorDimension: 'ROWS', values: [cells(args.input.values)] },
    },
    requestOptions(args.req),
  );
  return { row: updatedRow(data.updates?.updatedRange), updates: data.updates ?? {} };
}

export const appendRow = {
  slug: 'appendRow' as const,
  description: 'Append a row using ordered values or column-letter keys.',
  input: writeInput,
  output: writeOutput,
  idempotent: false,
  run: appendValues,
};

const insertInput = writeInput.extend({
  afterRow: z.number().int().nonnegative().max(9_999_999).default(1),
});
export const insertRow = {
  slug: 'insertRow' as const,
  description: 'Insert a row after a specified row, defaulting to just below the header.',
  input: insertInput,
  output: writeOutput,
  idempotent: false,
  async run(args: SheetsArgs<z.output<typeof insertInput>>) {
    const sheet = await worksheet(args);
    const row = args.input.afterRow + 1;
    await batch(args, [
      {
        insertDimension: {
          range: {
            sheetId: args.input.sheetId,
            dimension: 'ROWS',
            startIndex: row - 1,
            endIndex: row,
          },
          inheritFromBefore: row > 1,
        },
      },
    ]);
    const { data } = await args.client.sheets.spreadsheets.values.update(
      {
        spreadsheetId: args.input.spreadsheetId,
        range: sheetRange(sheet.title!, `${row}:${row}`),
        valueInputOption: args.input.valueInputOption,
        requestBody: { majorDimension: 'ROWS', values: [cells(args.input.values)] },
      },
      requestOptions(args.req),
    );
    return { row, updates: data };
  },
};

const updateInput = writeInput.extend({ row: rowNumber });
export const updateRow = {
  slug: 'updateRow' as const,
  description: 'Update a row; empty and null values leave existing cells unchanged.',
  input: updateInput,
  output: writeOutput,
  idempotent: true,
  async run(args: SheetsArgs<z.output<typeof updateInput>>) {
    const sheet = await worksheet(args);
    const { data } = await args.client.sheets.spreadsheets.values.update(
      {
        spreadsheetId: args.input.spreadsheetId,
        range: sheetRange(sheet.title!, `${args.input.row}:${args.input.row}`),
        valueInputOption: args.input.valueInputOption,
        requestBody: { majorDimension: 'ROWS', values: [cells(args.input.values, true)] },
      },
      requestOptions(args.req),
    );
    return { row: args.input.row, updates: data };
  },
};

const updatesInput = sheetInput.extend({
  rows: z.array(z.object({ row: rowNumber.optional(), values: rowValues })),
  valueInputOption,
});
const updatesOutput = z
  .object({
    spreadsheetId: z.string().nullish(),
    totalUpdatedRows: z.number().nullish(),
    totalUpdatedCells: z.number().nullish(),
    responses: z.array(updateOutput).nullish(),
  })
  .passthrough();
export const updateRows = {
  slug: 'updateRows' as const,
  description:
    'Batch-update rows, skipping entries without a row number and leaving empty cells unchanged.',
  input: updatesInput,
  output: updatesOutput,
  idempotent: true,
  async run(args: SheetsArgs<z.output<typeof updatesInput>>) {
    const rows = args.input.rows.filter((row) => row.row != null);
    if (!rows.length) return { totalUpdatedRows: 0, totalUpdatedCells: 0, responses: [] };
    const sheet = await worksheet(args);
    return (
      await args.client.sheets.spreadsheets.values.batchUpdate(
        {
          spreadsheetId: args.input.spreadsheetId,
          requestBody: {
            valueInputOption: args.input.valueInputOption,
            data: rows.map((row) => ({
              range: sheetRange(sheet.title!, `${row.row}:${row.row}`),
              majorDimension: 'ROWS',
              values: [cells(row.values, true)],
            })),
          },
        },
        requestOptions(args.req),
      )
    ).data;
  },
};

const appendRowsInput = sheetInput.extend({
  data: z.discriminatedUnion('format', [
    z.object({ format: z.literal('columns'), rows: z.array(rowValues) }),
    z.object({ format: z.literal('json'), rows: z.array(z.record(z.string(), z.json())) }),
    z.object({ format: z.literal('csv'), text: z.string() }),
  ]),
  headerRow: rowNumber.default(1),
  overwrite: z.boolean().default(false),
  duplicateColumn: z
    .string()
    .regex(/^[A-Z]{1,3}$/)
    .optional(),
  valueInputOption,
});
export const appendRows = {
  slug: 'appendRows' as const,
  description:
    'Append CSV, JSON, or column-keyed rows; optionally overwrite data or exclude keys already in the worksheet.',
  input: appendRowsInput,
  output: z.object({
    insertedRows: z.number().int().nonnegative(),
    updates: updateOutput.or(updatesOutput),
    clearedRanges: z.array(z.string()).optional(),
  }),
  idempotent: false,
  async run(args: SheetsArgs<z.output<typeof appendRowsInput>>) {
    const { input, client, req } = args;
    const sheet = await worksheet(args);
    const headerRange = sheetRange(sheet.title!, `${input.headerRow}:${input.headerRow}`);
    const headers: string[] = (
      (await readValues({ ...args, spreadsheetId: input.spreadsheetId, range: headerRange }))[0] ??
      []
    ).map(String);

    let rows: ReturnType<typeof cells>[];
    if (input.data.format === 'columns') rows = input.data.rows.map((row) => cells(row));
    else if (input.data.format === 'csv') {
      if (!headers.length) throw new Error('CSV import requires a populated worksheet header row.');
      const records = parse(input.data.text, {
        columns: true,
        bom: true,
        skip_empty_lines: true,
      }) as Record<string, string>[];
      rows = records.map((record) => {
        const normalized = Object.fromEntries(
          Object.entries(record).map(([key, value]) => [key.trim().toLowerCase(), value]),
        );
        return headers.map((header) => normalized[header.trim().toLowerCase()] ?? '');
      });
    } else {
      const records = input.data.rows;
      const additions = [...new Set(records.flatMap(Object.keys))].filter(
        (key) => !headers.includes(key),
      );
      headers.push(...additions);
      if (additions.length) {
        await client.sheets.spreadsheets.values.update(
          {
            spreadsheetId: input.spreadsheetId,
            range: headerRange,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [headers] },
          },
          requestOptions(req),
        );
      }
      rows = records.map((record) => cells(headers.map((header) => record[header] ?? '')));
    }

    if (input.overwrite) {
      const start = input.headerRow + 1;
      const updates = rows.length
        ? (
            await client.sheets.spreadsheets.values.batchUpdate(
              {
                spreadsheetId: input.spreadsheetId,
                requestBody: {
                  valueInputOption: input.valueInputOption,
                  data: [
                    {
                      range: sheetRange(sheet.title!, `A${start}`),
                      majorDimension: 'ROWS',
                      values: rows,
                    },
                  ],
                },
              },
              requestOptions(req),
            )
          ).data
        : { totalUpdatedRows: 0 };
      const end = sheet.gridProperties?.rowCount ?? start + rows.length;
      const clearedRanges =
        start + rows.length <= end
          ? ((
              await client.sheets.spreadsheets.values.batchClear(
                {
                  spreadsheetId: input.spreadsheetId,
                  requestBody: {
                    ranges: [sheetRange(sheet.title!, `${start + rows.length}:${end}`)],
                  },
                },
                requestOptions(req),
              )
            ).data.clearedRanges ?? [])
          : [];
      return { insertedRows: rows.length, updates, clearedRanges };
    }

    if (input.duplicateColumn) {
      const index = columnIndex(input.duplicateColumn);
      const existing = await readValues({
        ...args,
        spreadsheetId: input.spreadsheetId,
        range: sheetRange(sheet.title!),
      });
      const keys = new Set(
        existing
          .filter((row) => index < Math.max(headers.length, row.length))
          .map((row) =>
            String(row[index] ?? '')
              .trim()
              .toLowerCase(),
          ),
      );
      rows = rows.filter((row, rowIndex) => {
        const original = input.data.format === 'columns' ? input.data.rows[rowIndex] : undefined;
        const value = original
          ? Array.isArray(original)
            ? original[index]
            : original[input.duplicateColumn!]
          : row[index];
        return value == null || !keys.has(String(value).trim().toLowerCase());
      });
    }

    if (!rows.length) return { insertedRows: 0, updates: {} };
    const { data } = await client.sheets.spreadsheets.values.append(
      {
        spreadsheetId: input.spreadsheetId,
        range: sheetRange(sheet.title!, 'A:A'),
        valueInputOption: input.valueInputOption,
        requestBody: { majorDimension: 'ROWS', values: rows },
      },
      requestOptions(req),
    );

    return { insertedRows: rows.length, updates: data.updates ?? {} };
  },
};

const deleteInput = sheetInput.extend({ row: rowNumber });
export const deleteRow = {
  slug: 'deleteRow' as const,
  description: 'Delete a row and shift following rows upward.',
  input: deleteInput,
  output: batchOutput,
  idempotent: false,
  run: (args: SheetsArgs<z.output<typeof deleteInput>>) =>
    batch(args, [
      {
        deleteDimension: {
          range: {
            sheetId: args.input.sheetId,
            dimension: 'ROWS',
            startIndex: args.input.row - 1,
            endIndex: args.input.row,
          },
        },
      },
    ]),
};
const rowSelection = z.discriminatedUnion('mode', [
  z
    .object({ mode: z.literal('range'), startRow: rowNumber, endRow: rowNumber.optional() })
    .refine(
      (value) => value.endRow == null || value.endRow >= value.startRow,
      'End row must not precede start row.',
    ),
  z.object({ mode: z.literal('list'), rows: z.array(rowNumber).min(1) }),
]);
const deleteRowsInput = sheetInput.extend({ selection: rowSelection });
export const deleteRows = {
  slug: 'deleteRows' as const,
  description: 'Delete a row range or distinct row numbers in descending order.',
  input: deleteRowsInput,
  output: z.object({
    deletedRanges: z.array(z.object({ startRow: rowNumber, endRow: rowNumber })),
    result: batchOutput,
  }),
  idempotent: false,
  async run(args: SheetsArgs<z.output<typeof deleteRowsInput>>) {
    const selection = args.input.selection;
    const ranges =
      selection.mode === 'range'
        ? [{ startRow: selection.startRow, endRow: selection.endRow ?? selection.startRow }]
        : [...new Set(selection.rows)]
            .sort((a, b) => b - a)
            .map((row) => ({ startRow: row, endRow: row }));
    return {
      deletedRanges: ranges,
      result: await batch(
        args,
        ranges.map(({ startRow, endRow }) => ({
          deleteDimension: {
            range: {
              sheetId: args.input.sheetId,
              dimension: 'ROWS',
              startIndex: startRow - 1,
              endIndex: endRow,
            },
          },
        })),
      ),
    };
  },
};

const searchInput = readInput.extend({
  column: z
    .string()
    .regex(/^[A-Z]{1,3}$/)
    .default('A'),
  searchValue: z.string().default(''),
  exactMatch: z.boolean().default(false),
  startRow: rowNumber.default(1),
  limit: rowNumber.default(1),
});
async function searchRows(args: SheetsArgs<z.output<typeof searchInput>>) {
  const rows = await readRows(
    { ...args, input: { ...args.input, useHeaderNames: false } },
    args.input.startRow,
  );
  const { input } = args;
  const matches = rows
    .filter(
      ({ values }) =>
        input.searchValue === '' ||
        (input.exactMatch
          ? values[input.column] === input.searchValue
          : values[input.column]?.toLowerCase().includes(input.searchValue.toLowerCase())),
    )
    .slice(0, input.limit);
  if (!input.useHeaderNames || !matches.length) return matches;
  const sheet = await worksheet(args);
  const headers =
    (
      await readValues({
        ...args,
        spreadsheetId: input.spreadsheetId,
        range: sheetRange(sheet.title!, `${input.headerRow}:${input.headerRow}`),
      })
    )[0] ?? [];
  return matches.map(
    (row) =>
      mapRows({
        values: [Object.values(row.values)],
        startRow: row.row,
        headers,
        useHeaderNames: true,
      })[0]!,
  );
}
export const findRows = {
  slug: 'findRows' as const,
  description:
    'Find rows by exact case-sensitive equality or case-insensitive substring, preserving physical row numbers.',
  input: searchInput,
  output: z.array(rowOutput),
  idempotent: true,
  run: searchRows,
};

const findOrCreateInput = searchInput.extend({ values: rowValues, valueInputOption });
export const findOrCreateRow = {
  slug: 'findOrCreateRow' as const,
  description: 'Return the first matching row, or append supplied values when no row matches.',
  input: findOrCreateInput,
  output: rowOutput.extend({ found: z.boolean(), created: z.boolean() }),
  idempotent: false,
  async run(args: SheetsArgs<z.output<typeof findOrCreateInput>>) {
    const [found] = await searchRows({ ...args, input: { ...args.input, limit: 1 } });
    if (found) return { ...found, found: true, created: false };
    const result = await appendValues(args);
    let headers: unknown[] = [];
    if (args.input.useHeaderNames) {
      const sheet = await worksheet(args);
      headers =
        (
          await readValues({
            ...args,
            spreadsheetId: args.input.spreadsheetId,
            range: sheetRange(sheet.title!, `${args.input.headerRow}:${args.input.headerRow}`),
          })
        )[0] ?? [];
    }
    return {
      ...mapRows({
        values: [cells(args.input.values)],
        startRow: result.row,
        headers,
        useHeaderNames: args.input.useHeaderNames,
      })[0]!,
      found: false,
      created: true,
    };
  },
};

const getRowInput = readInput.extend({ row: rowNumber });
export const getRow = {
  slug: 'getRow' as const,
  description:
    'Read one physical row, returning found=false when it is beyond the populated range.',
  input: getRowInput,
  output: z.union([
    rowOutput.extend({ found: z.literal(true) }),
    z.object({ found: z.literal(false), row: z.null() }),
  ]),
  idempotent: true,
  async run(args: SheetsArgs<z.output<typeof getRowInput>>) {
    const [row] = await readRows(args, args.input.row, args.input.row);
    return row ? { found: true as const, ...row } : { found: false as const, row: null };
  },
};
const getRowsInput = readInput.extend({ skipHeaders: z.boolean().default(false) });
export const getRows = {
  slug: 'getRows' as const,
  description: 'Read all populated rows, optionally skipping the header and preceding rows.',
  input: getRowsInput,
  output: z.array(rowOutput),
  idempotent: true,
  run: (args: SheetsArgs<z.output<typeof getRowsInput>>) =>
    readRows(args, args.input.skipHeaders ? args.input.headerRow + 1 : 1),
};

const nextInput = readInput.extend({
  startRow: rowNumber.default(1),
  batchSize: rowNumber.default(1),
  memoryKey: z.string().min(1).default('row_number'),
});
export const getNextRows = {
  slug: 'getNextRows' as const,
  description:
    'Read and persist the next batch under an owner-, instance-, and worksheet-scoped memory key.',
  input: nextInput,
  output: z.array(rowOutput),
  idempotent: false,
  async run(args: SheetsArgs<z.output<typeof nextInput>>) {
    const { req, input } = args;
    requestOptions(req);
    const owner = req.user ? [req.user.collection, req.user.id] : ['developer'];
    if (req.user && (!req.user.collection || req.user.id == null)) {
      throw new Error('A persistent Sheets cursor requires an identifiable owner.');
    }
    let instanceSlug: string | undefined;
    for (const instance of req.frogbot.config.pieces.instances) {
      if (instance.piece !== 'google-sheets') continue;
      const client = await instance.client({ req }).catch(() => undefined);
      if (client === args.client) {
        instanceSlug = instance.slug;
        break;
      }
    }
    if (!instanceSlug) {
      throw new Error(
        'Register the Google Sheets piece instance in your configuration before using a persistent cursor.',
      );
    }
    const key = `pieces:google-sheets:cursor:${createHash('sha256')
      .update(
        JSON.stringify([owner, instanceSlug, input.spreadsheetId, input.sheetId, input.memoryKey]),
      )
      .digest('hex')}`;
    return req.frogbot.kv.lock(`${key}:lock`, 30_000, async ({ signal: lease }) => {
      const signal = req.signal ? AbortSignal.any([req.signal, lease]) : lease;
      signal.throwIfAborted();
      const stored = await req.frogbot.kv.get(key);
      const start =
        stored == null ? input.startRow : z.number().int().positive().max(10_000_001).parse(stored);
      const lockedArgs = {
        ...args,
        req: new Proxy(req, {
          get: (target, property) =>
            property === 'signal' ? signal : Reflect.get(target, property),
        }),
      };
      let rows = await readRows(lockedArgs, start, start + input.batchSize - 1);
      if (rows.length < input.batchSize) {
        rows = (await readRows(lockedArgs, start)).slice(0, input.batchSize);
      }
      signal.throwIfAborted();
      if (rows.length) await req.frogbot.kv.set(key, start + rows.length);
      signal.throwIfAborted();
      return rows;
    });
  },
};
