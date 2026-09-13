import type { FrogbotRequest } from 'frogbot';
import type { PieceRunArgs } from 'frogbot/pieces';
import type { sheets_v4 } from 'googleapis';
import { z } from 'zod';

import type { GoogleSheetsClient } from './client.js';

export type SheetsArgs<T> = PieceRunArgs<T, object, GoogleSheetsClient>;
export const rowNumber = z.number().int().positive().max(10_000_000);
export const sheetInput = z.object({
  spreadsheetId: z.string().min(1),
  sheetId: z.number().int().nonnegative(),
});
export const cell = z.json();
export const rowValues = z.union([
  z.array(cell).min(1).max(18278),
  z.record(z.string(), cell).refine((value) => Object.keys(value).length > 0),
]);
export const valueInputOption = z.enum(['RAW', 'USER_ENTERED']).default('USER_ENTERED');
export const readInput = sheetInput.extend({
  headerRow: rowNumber.default(1),
  useHeaderNames: z.boolean().default(false),
});
export const rowOutput = z.object({ row: rowNumber, values: z.record(z.string(), z.string()) });
export const updateOutput = z
  .object({
    spreadsheetId: z.string().nullish(),
    updatedRange: z.string().nullish(),
    updatedRows: z.number().nullish(),
    updatedColumns: z.number().nullish(),
    updatedCells: z.number().nullish(),
  })
  .passthrough();
export const batchOutput = z
  .object({ spreadsheetId: z.string().nullish(), replies: z.array(z.json()).nullish() })
  .passthrough();
export const worksheetOutput = z
  .object({
    sheetId: z.number().int(),
    title: z.string(),
    index: z.number().nullish(),
    gridProperties: z
      .object({ rowCount: z.number().nullish(), columnCount: z.number().nullish() })
      .passthrough()
      .nullish(),
  })
  .passthrough();

export function requestOptions(req: Pick<FrogbotRequest, 'signal'>) {
  req.signal?.throwIfAborted();
  return {
    signal: req.signal ?? undefined,
    redirect: 'error' as const,
    maxRedirects: 0,
    retry: false,
  };
}

export function columnLabel(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= 18278) {
    throw new Error('Column index must be between 0 and 18277.');
  }
  let label = '';
  for (let value = index; value >= 0; value = Math.floor(value / 26) - 1) {
    label = String.fromCharCode(65 + (value % 26)) + label;
  }
  return label;
}

export function columnIndex(label: string): number {
  if (!/^[A-Z]{1,3}$/.test(label)) throw new Error(`Invalid column label '${label}'.`);
  return [...label].reduce((index, char) => index * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

export function sheetRange(title: string, range?: string) {
  return `'${title.replaceAll("'", "''")}'${range ? `!${range}` : ''}`;
}

export async function worksheet({ client, req, input }: SheetsArgs<z.output<typeof sheetInput>>) {
  const { data } = await client.sheets.spreadsheets.get(
    { spreadsheetId: input.spreadsheetId, fields: 'sheets.properties' },
    requestOptions(req),
  );
  const result = data.sheets?.find(
    (sheet) => sheet.properties?.sheetId === input.sheetId,
  )?.properties;
  if (!result?.title) {
    throw new Error(
      `Worksheet ${input.sheetId} not found in spreadsheet '${input.spreadsheetId}'.`,
    );
  }
  return result;
}

export async function readValues({
  client,
  req,
  spreadsheetId,
  range,
}: {
  client: GoogleSheetsClient;
  req: Pick<FrogbotRequest, 'signal'>;
  spreadsheetId: string;
  range: string;
}) {
  return (
    (await client.sheets.spreadsheets.values.get({ spreadsheetId, range }, requestOptions(req)))
      .data.values ?? []
  );
}

export function mapRows({
  values,
  startRow,
  headers,
  useHeaderNames,
}: {
  values: unknown[][];
  startRow: number;
  headers: unknown[];
  useHeaderNames: boolean;
}) {
  return values.map((values, index) => ({
    row: startRow + index,
    values: Object.fromEntries(
      Array.from({ length: Math.max(values.length, headers.length) }, (_, column) => [
        useHeaderNames && headers[column] ? String(headers[column]) : columnLabel(column),
        String(values[column] ?? ''),
      ]),
    ),
  }));
}

export async function readRows(
  args: SheetsArgs<z.output<typeof readInput>>,
  startRow = 1,
  endRow?: number,
) {
  const sheet = await worksheet(args);
  const count = sheet.gridProperties?.rowCount;
  if (count != null && startRow > count) return [];
  const end = endRow == null ? '' : Math.min(endRow, count ?? endRow);
  const values = await readValues({
    ...args,
    spreadsheetId: args.input.spreadsheetId,
    range: sheetRange(sheet.title!, `A${startRow}:ZZZ${end}`),
  });
  if (!values.length) return [];
  const headers =
    (
      await readValues({
        ...args,
        spreadsheetId: args.input.spreadsheetId,
        range: sheetRange(sheet.title!, `${args.input.headerRow}:${args.input.headerRow}`),
      })
    )[0] ?? [];
  return mapRows({ values, headers, startRow, useHeaderNames: args.input.useHeaderNames });
}

export function cells(values: z.output<typeof rowValues>, updating = false) {
  let ordered: z.output<typeof cell>[];
  if (Array.isArray(values)) ordered = values;
  else {
    const entries = Object.entries(values).map(
      ([key, value]) => [columnIndex(key), value] as const,
    );
    ordered = Array.from({ length: Math.max(...entries.map(([index]) => index)) + 1 }, () => null);
    for (const [index, value] of entries) ordered[index] = value;
  }
  return ordered.map((value) => {
    if (value == null || value === '') return updating ? null : '';
    return typeof value === 'object'
      ? JSON.stringify(value, null, updating ? 2 : undefined)
      : value;
  });
}

export function updatedRow(range: string | null | undefined) {
  const match = range?.match(/![A-Z]+(\d+)(?::|$)/);
  if (!match) throw new Error('Google Sheets did not return an updated row range.');
  return Number(match[1]);
}

export async function batch(
  args: SheetsArgs<{ spreadsheetId: string }>,
  requests: sheets_v4.Schema$Request[],
) {
  return (
    await args.client.sheets.spreadsheets.batchUpdate(
      { spreadsheetId: args.input.spreadsheetId, requestBody: { requests } },
      requestOptions(args.req),
    )
  ).data;
}
