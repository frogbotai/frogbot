import { type PieceRunArgs } from 'frogbot/pieces';
import json2xml from 'json2xml';
import { z } from 'zod';

const inputSchema = z.object({
  json: z.json().meta({ label: 'JSON' }),
  attributesKey: z
    .string()
    .optional()
    .meta({ label: 'Attribute field', description: "Field to add your tag's attributes" }),
  header: z.boolean().optional().meta({ label: 'Header', description: 'Add XML header' }),
});

export const convertJsonToXml = {
  slug: 'convertJsonToXml',
  label: 'Convert JSON to XML',
  description: 'Convert JSON to XML.',
  input: inputSchema,
  output: z.string().meta({ label: 'XML' }),
  async run({ input }: PieceRunArgs<z.output<typeof inputSchema>, object, undefined>) {
    const json = JSON.parse(JSON.stringify(input.json));
    const attributesKey = input.attributesKey ? input.attributesKey : 'attr';
    const header = input.header ? input.header : false;

    return json2xml(json, { attributes_key: attributesKey, header });
  },
};
