import { stringify } from 'csv-stringify/sync';
import { type PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

const jsonObject = z.record(z.string(), z.unknown());
const inputSchema = z.object({
  jsonArray: z.array(jsonObject).meta({
    label: 'JSON Array',
    description: 'Provide a JSON array to convert to CSV format.',
  }),
  delimiter: z.enum([',', '\t']).default(',').meta({
    label: 'Delimiter Type',
    description: 'Select the delimiter type for the CSV output.',
  }),
});

function flatten(value: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (child !== null && typeof child === 'object' && !Array.isArray(child)) {
      Object.assign(result, flatten(child as Record<string, unknown>, path));
    } else {
      result[path] = child;
    }
  }

  return result;
}

export const convertJsonToCsv = {
  slug: 'convertJsonToCsv',
  label: 'Convert JSON to CSV',
  description: 'Flatten a JSON array and convert it into CSV text.',
  input: inputSchema,
  output: z.string(),
  async run({ input }: PieceRunArgs<z.output<typeof inputSchema>, object, undefined>) {
    const flattened = input.jsonArray.map((item) => flatten(item));

    return stringify(flattened, { header: true, delimiter: input.delimiter });
  },
};
