import { z } from 'zod';

import { defineAction } from '../define.js';

const inputSchema = z.object({
  values: z.array(z.unknown()).meta({ label: 'Values' }),
  fields: z.array(z.string()).optional().meta({
    label: 'Fields',
    description: 'For object values, count uniqueness using only these fields.',
  }),
});

const outputSchema = z.object({ numUniques: z.number().int().nonnegative() });

function selectFields(value: unknown, fields: string[]) {
  const selected: Record<string, unknown> = {};

  if (typeof value !== 'object' || value === null) return selected;

  Object.entries(value).forEach(([key, fieldValue]) => {
    if (fields.includes(key)) selected[key] = fieldValue;
  });

  return selected;
}

export const countUniqueValues = defineAction({
  slug: 'countUniqueValues',
  label: 'Count Unique Values',
  description: 'Count unique values, optionally using selected object fields.',
  input: inputSchema,
  output: outputSchema,
  async run({ input }) {
    const fields = input.fields;
    const values = fields?.length
      ? input.values.map((value) => selectFields(value, fields))
      : input.values;

    const numUniques = new Set(values.map((value) => JSON.stringify(value))).size;

    return { numUniques };
  },
});
