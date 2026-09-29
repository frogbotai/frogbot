import { parse } from 'csv-parse/sync';
import { z } from 'zod';

import { defineAction } from '../define.js';

const delimiter = z.enum([',', '\t']).meta({
  label: 'Delimiter Type',
  description: 'Select the delimiter type for the CSV text.',
});
const inputSchema = z.object({
  csvText: z.string().default('').meta({ label: 'CSV Text' }),
  hasHeaders: z.boolean().default(false).meta({ label: 'Does the CSV have headers?' }),
  delimiter: delimiter.default(','),
});
const output = z.array(z.union([z.array(z.string()), z.record(z.string(), z.string())]));

export const convertCsvToJson = defineAction({
  slug: 'convertCsvToJson',
  label: 'Convert CSV to JSON',
  description: 'Read CSV text and convert it into a JSON array.',
  input: inputSchema,
  output,
  async run({ input }) {
    return parse(input.csvText, {
      columns: input.hasHeaders,
      delimiter: input.delimiter,
    });
  },
});
