import { type PieceRunArgs } from 'frogbot/pieces';
import * as XLSX from 'xlsx';
import { z } from 'zod';

import { loadFile } from '../files.js';

const inputSchema = z.object({
  fileId: z.union([z.string(), z.number()]).meta({
    label: 'Excel File',
    description: 'The Excel file (.xlsx or .xls) to convert to CSV.',
  }),
  sheetName: z.string().optional().meta({
    label: 'Sheet Name',
    description: 'Name of the sheet to convert. Leave blank to use the first sheet.',
  }),
  delimiter: z.enum([',', '\t', ';']).default(',').meta({
    label: 'Delimiter',
    description: 'Character used to separate values in the output CSV.',
  }),
});
const output = z.object({
  csv: z.string(),
  sheetName: z.string(),
  availableSheets: z.array(z.string()),
});

export const convertExcelToCsv = {
  slug: 'convertExcelToCsv',
  label: 'Convert Excel to CSV',
  description: 'Convert an Excel workbook into CSV text.',
  input: inputSchema,
  output,
  async run({ input, req }: PieceRunArgs<z.output<typeof inputSchema>, object, undefined>) {
    const buffer = await loadFile(req, input.fileId);
    const isXlsx = buffer[0] === 0x50 && buffer[1] === 0x4b;
    const isXls = buffer[0] === 0xd0 && buffer[1] === 0xcf;

    if (!isXlsx && !isXls) {
      throw new Error(
        'The file does not appear to be a valid Excel file (.xlsx or .xls). If you supplied a URL, make sure it points directly to the file download, not a webpage.',
      );
    }

    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = input.sheetName?.trim() || workbook.SheetNames[0];

    if (!sheetName || !workbook.SheetNames.includes(sheetName)) {
      throw new Error(
        `Sheet "${sheetName}" not found. Available sheets: ${workbook.SheetNames.join(', ')}`,
      );
    }

    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
      throw new Error(`Sheet "${sheetName}" is unavailable.`);
    }

    return {
      csv: XLSX.utils.sheet_to_csv(worksheet, { FS: input.delimiter }),
      sheetName,
      availableSheets: workbook.SheetNames,
    };
  },
};
