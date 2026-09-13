import type { sheets_v4 } from 'googleapis';
import { z } from 'zod';

import {
  batch,
  batchOutput,
  columnLabel,
  readValues,
  requestOptions,
  rowNumber,
  sheetInput,
  sheetRange,
  type SheetsArgs,
  updateOutput,
  worksheet,
  worksheetOutput,
} from './shared.js';

const createSpreadsheetInput = z.object({
  title: z.string().min(1),
  folderId: z.string().min(1).optional(),
});
const spreadsheetOutput = z
  .object({
    id: z.string(),
    name: z.string().nullish(),
    webViewLink: z.string().nullish(),
    createdTime: z.string().nullish(),
    modifiedTime: z.string().nullish(),
  })
  .passthrough();
export const createSpreadsheet = {
  slug: 'createSpreadsheet' as const,
  description: 'Create a spreadsheet, optionally in a Drive folder.',
  input: createSpreadsheetInput,
  output: spreadsheetOutput,
  idempotent: false,
  async run({ client, req, input }: SheetsArgs<z.output<typeof createSpreadsheetInput>>) {
    return (
      await client.drive.files.create(
        {
          supportsAllDrives: true,
          fields: 'id,name,webViewLink',
          requestBody: {
            name: input.title,
            mimeType: 'application/vnd.google-apps.spreadsheet',
            parents: input.folderId ? [input.folderId] : undefined,
          },
        },
        requestOptions(req),
      )
    ).data;
  },
};

const createInput = z.object({
  spreadsheetId: z.string().min(1),
  title: z.string().min(1),
  headers: z.array(z.string()).optional(),
});
async function addWorksheet(args: SheetsArgs<z.output<typeof createInput>>) {
  const result = await batch(args, [{ addSheet: { properties: { title: args.input.title } } }]);
  const properties = result.replies?.[0]?.addSheet?.properties;
  if (properties?.sheetId == null || !properties.title) {
    throw new Error('Google Sheets did not return the created worksheet.');
  }
  if (args.input.headers?.length) {
    await args.client.sheets.spreadsheets.values.update(
      {
        spreadsheetId: args.input.spreadsheetId,
        range: sheetRange(properties.title, 'A1'),
        valueInputOption: 'RAW',
        requestBody: { majorDimension: 'ROWS', values: [args.input.headers] },
      },
      requestOptions(args.req),
    );
  }
  return worksheetOutput.parse(properties);
}
export const createWorksheet = {
  slug: 'createWorksheet' as const,
  description: 'Create a worksheet with optional headers.',
  input: createInput,
  output: worksheetOutput,
  idempotent: false,
  run: addWorksheet,
};
export const findOrCreateWorksheet = {
  slug: 'findOrCreateWorksheet' as const,
  description: 'Find a worksheet by exact title, or create it with optional headers.',
  input: createInput,
  output: z.object({ found: z.boolean(), created: z.boolean(), worksheet: worksheetOutput }),
  idempotent: false,
  async run(args: SheetsArgs<z.output<typeof createInput>>) {
    const { data } = await args.client.sheets.spreadsheets.get(
      { spreadsheetId: args.input.spreadsheetId, fields: 'sheets.properties' },
      requestOptions(args.req),
    );
    const found = data.sheets?.find(
      (sheet) => sheet.properties?.title === args.input.title,
    )?.properties;
    return found
      ? { found: true, created: false, worksheet: worksheetOutput.parse(found) }
      : { found: false, created: true, worksheet: await addWorksheet(args) };
  },
};

const clearSheetInput = sheetInput.extend({
  preserveHeaders: z.boolean().default(false),
  headerRow: rowNumber.default(1),
});
const clearOutput = z.object({
  spreadsheetId: z.string().nullish(),
  clearedRange: z.string().nullish(),
});
export const clearWorksheet = {
  slug: 'clearWorksheet' as const,
  description: 'Clear worksheet values while retaining formatting and, optionally, headers.',
  input: clearSheetInput,
  output: clearOutput,
  idempotent: true,
  async run(args: SheetsArgs<z.output<typeof clearSheetInput>>) {
    const sheet = await worksheet(args);
    const start = args.input.preserveHeaders ? args.input.headerRow + 1 : 1;
    if (sheet.gridProperties?.rowCount != null && start > sheet.gridProperties.rowCount) {
      return { spreadsheetId: args.input.spreadsheetId };
    }
    return (
      await args.client.sheets.spreadsheets.values.clear(
        {
          spreadsheetId: args.input.spreadsheetId,
          range: sheetRange(sheet.title!, `A${start}:ZZZ`),
        },
        requestOptions(args.req),
      )
    ).data;
  },
};
const rangeInput = sheetInput
  .extend({ startRow: rowNumber, endRow: rowNumber.optional() })
  .refine(
    (input) => input.endRow == null || input.endRow >= input.startRow,
    'End row must not precede start row.',
  );
export const clearRows = {
  slug: 'clearRows' as const,
  description: 'Clear values in a row range without deleting rows or formatting.',
  input: rangeInput,
  output: clearOutput,
  idempotent: true,
  async run(args: SheetsArgs<z.output<typeof rangeInput>>) {
    const sheet = await worksheet(args);
    return (
      await args.client.sheets.spreadsheets.values.clear(
        {
          spreadsheetId: args.input.spreadsheetId,
          range: sheetRange(
            sheet.title!,
            `${args.input.startRow}:${args.input.endRow ?? args.input.startRow}`,
          ),
        },
        requestOptions(args.req),
      )
    ).data;
  },
};
export const deleteWorksheet = {
  slug: 'deleteWorksheet' as const,
  description: 'Delete a worksheet and its contents.',
  input: sheetInput,
  output: batchOutput,
  idempotent: true,
  run: (args: SheetsArgs<z.output<typeof sheetInput>>) =>
    batch(args, [{ deleteSheet: { sheetId: args.input.sheetId } }]),
};
const renameInput = sheetInput.extend({ title: z.string().min(1) });
export const renameWorksheet = {
  slug: 'renameWorksheet' as const,
  description: 'Rename a worksheet by its stable ID.',
  input: renameInput,
  output: batchOutput,
  idempotent: true,
  run: (args: SheetsArgs<z.output<typeof renameInput>>) =>
    batch(args, [
      {
        updateSheetProperties: {
          properties: { sheetId: args.input.sheetId, title: args.input.title },
          fields: 'title',
        },
      },
    ]),
};

const color = z.string().regex(/^#?(?:[a-fA-F0-9]{3}|[a-fA-F0-9]{6})$/);
const formatInput = rangeInput
  .safeExtend({
    backgroundColor: color.optional(),
    textColor: color.optional(),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    strikethrough: z.boolean().optional(),
  })
  .refine(
    (input) =>
      [input.backgroundColor, input.textColor, input.bold, input.italic, input.strikethrough].some(
        (value) => value != null,
      ),
    'Specify at least one format property.',
  );
function rgb(hex: string) {
  const raw = hex.replace(/^#/, '');
  const full = raw.length === 3 ? [...raw].map((char) => char.repeat(2)).join('') : raw;
  return {
    red: parseInt(full.slice(0, 2), 16) / 255,
    green: parseInt(full.slice(2, 4), 16) / 255,
    blue: parseInt(full.slice(4, 6), 16) / 255,
  };
}
export const formatRows = {
  slug: 'formatRows' as const,
  description:
    'Apply selected row formatting using HEX colors, leaving unspecified formatting untouched.',
  input: formatInput,
  output: batchOutput,
  idempotent: true,
  run(args: SheetsArgs<z.output<typeof formatInput>>) {
    const { input } = args;
    const format: sheets_v4.Schema$CellFormat = {};
    const fields: string[] = [];

    if (input.backgroundColor) {
      format.backgroundColor = rgb(input.backgroundColor);
      fields.push('userEnteredFormat.backgroundColor');
    }

    const text: sheets_v4.Schema$TextFormat = {};
    for (const key of ['bold', 'italic', 'strikethrough'] as const) {
      if (input[key] != null) {
        text[key] = input[key];
        fields.push(`userEnteredFormat.textFormat.${key}`);
      }
    }

    if (input.textColor) {
      text.foregroundColor = rgb(input.textColor);
      fields.push('userEnteredFormat.textFormat.foregroundColor');
    }

    if (Object.keys(text).length) format.textFormat = text;
    return batch(args, [
      {
        repeatCell: {
          range: {
            sheetId: input.sheetId,
            startRowIndex: input.startRow - 1,
            endRowIndex: input.endRow ?? input.startRow,
          },
          cell: { userEnteredFormat: format },
          fields: fields.join(','),
        },
      },
    ]);
  },
};

const readRangeInput = sheetInput.extend({
  range: z
    .string()
    .regex(
      /^(?:\$?[A-Z]+\$?\d+(?::\$?[A-Z]+\$?\d+)?|\$?[A-Z]+:\$?[A-Z]+|\d+:\d+|\$?[A-Z]+\$?\d+:\$?[A-Z]+)$/,
    )
    .optional(),
  majorDimension: z.enum(['ROWS', 'COLUMNS']).default('ROWS'),
  valueRenderOption: z
    .enum(['FORMATTED_VALUE', 'UNFORMATTED_VALUE', 'FORMULA'])
    .default('FORMATTED_VALUE'),
});
export const readRange = {
  slug: 'readRange' as const,
  description: 'Read a worksheet-local A1 range, with row/column orientation and value rendering.',
  input: readRangeInput,
  output: z.object({
    range: z.string(),
    majorDimension: z.enum(['ROWS', 'COLUMNS']),
    values: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))),
  }),
  idempotent: true,
  async run(args: SheetsArgs<z.output<typeof readRangeInput>>) {
    const sheet = await worksheet(args);
    const range = sheetRange(sheet.title!, args.input.range);
    const { data } = await args.client.sheets.spreadsheets.values.get(
      {
        spreadsheetId: args.input.spreadsheetId,
        range,
        majorDimension: args.input.majorDimension,
        valueRenderOption: args.input.valueRenderOption,
      },
      requestOptions(args.req),
    );
    return {
      range: data.range ?? range,
      majorDimension: args.input.majorDimension,
      values: data.values ?? [],
    };
  },
};

const findSpreadsheetInput = z.object({
  name: z.string().min(1),
  exactMatch: z.boolean().default(false),
  includeSharedDrives: z.boolean().default(false),
});
export const findSpreadsheets = {
  slug: 'findSpreadsheets' as const,
  description: 'Find spreadsheets by exact or partial name across all result pages.',
  input: findSpreadsheetInput,
  output: z.object({ found: z.boolean(), spreadsheets: z.array(spreadsheetOutput) }),
  idempotent: true,
  async run({ client, input, req }: SheetsArgs<z.output<typeof findSpreadsheetInput>>) {
    const spreadsheets = [];
    let pageToken: string | undefined;
    const seen = new Set<string>();
    do {
      const name = input.name.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
      const { data } = await client.drive.files.list(
        {
          q: `mimeType='application/vnd.google-apps.spreadsheet' and trashed=false and name ${input.exactMatch ? '=' : 'contains'} '${name}'`,
          supportsAllDrives: true,
          includeItemsFromAllDrives: input.includeSharedDrives,
          corpora: input.includeSharedDrives ? 'allDrives' : 'user',
          fields: 'files(id,name,webViewLink,createdTime,modifiedTime),nextPageToken',
          pageSize: 1000,
          pageToken,
        },
        requestOptions(req),
      );
      spreadsheets.push(...(data.files ?? []));
      pageToken = data.nextPageToken ?? undefined;
      if (pageToken && seen.has(pageToken)) {
        throw new Error('Google Drive returned a repeated pagination token.');
      }
      if (pageToken) seen.add(pageToken);
    } while (pageToken);
    return { found: spreadsheets.length > 0, spreadsheets };
  },
};
const findWorksheetInput = z.object({
  spreadsheetId: z.string().min(1),
  title: z.string(),
  exactMatch: z.boolean().default(false),
});
export const findWorksheets = {
  slug: 'findWorksheets' as const,
  description: 'Find worksheet properties by exact or partial title.',
  input: findWorksheetInput,
  output: z.object({ found: z.boolean(), worksheets: z.array(worksheetOutput) }),
  idempotent: true,
  async run({ client, req, input }: SheetsArgs<z.output<typeof findWorksheetInput>>) {
    const { data } = await client.sheets.spreadsheets.get(
      { spreadsheetId: input.spreadsheetId, fields: 'sheets.properties' },
      requestOptions(req),
    );
    const worksheets = (data.sheets ?? []).flatMap((sheet) =>
      sheet.properties?.title != null &&
      (input.exactMatch
        ? sheet.properties.title === input.title
        : sheet.properties.title.includes(input.title))
        ? [sheet.properties]
        : [],
    );
    return { found: worksheets.length > 0, worksheets };
  },
};
const copyInput = sheetInput.extend({ destinationSpreadsheetId: z.string().min(1) });
export const copyWorksheet = {
  slug: 'copyWorksheet' as const,
  description: 'Copy worksheet values and formatting into a destination spreadsheet.',
  input: copyInput,
  output: worksheetOutput,
  idempotent: false,
  async run({ client, req, input }: SheetsArgs<z.output<typeof copyInput>>) {
    return (
      await client.sheets.spreadsheets.sheets.copyTo(
        {
          spreadsheetId: input.spreadsheetId,
          sheetId: input.sheetId,
          requestBody: { destinationSpreadsheetId: input.destinationSpreadsheetId },
        },
        requestOptions(req),
      )
    ).data;
  },
};
const columnInput = sheetInput.extend({
  name: z.string().min(1),
  index: z.number().int().max(18278).optional(),
  headerRow: rowNumber.default(1),
});
export const createColumn = {
  slug: 'createColumn' as const,
  description:
    'Insert a column at a 1-based index, or after the last header when omitted or nonpositive.',
  input: columnInput,
  output: z.object({ column: z.string(), index: rowNumber, updates: updateOutput }),
  idempotent: false,
  async run(args: SheetsArgs<z.output<typeof columnInput>>) {
    const sheet = await worksheet(args);
    const index =
      args.input.index && args.input.index > 0
        ? args.input.index - 1
        : (
            (
              await readValues({
                ...args,
                spreadsheetId: args.input.spreadsheetId,
                range: sheetRange(sheet.title!, `${args.input.headerRow}:${args.input.headerRow}`),
              })
            )[0] ?? []
          ).length;

    const column = columnLabel(index);
    const count = sheet.gridProperties?.columnCount;
    if (count != null && index > count) throw new Error('Column index exceeds worksheet width.');

    await batch(args, [
      count === index
        ? { appendDimension: { sheetId: args.input.sheetId, dimension: 'COLUMNS', length: 1 } }
        : {
            insertDimension: {
              range: {
                sheetId: args.input.sheetId,
                dimension: 'COLUMNS',
                startIndex: index,
                endIndex: index + 1,
              },
            },
          },
    ]);
    const { data } = await args.client.sheets.spreadsheets.values.update(
      {
        spreadsheetId: args.input.spreadsheetId,
        range: sheetRange(sheet.title!, `${column}${args.input.headerRow}`),
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[args.input.name]] },
      },
      requestOptions(args.req),
    );

    return { column, index: index + 1, updates: data };
  },
};
