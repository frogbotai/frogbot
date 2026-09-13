import { XMLParser } from 'fast-xml-parser';
import { type PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

const inputSchema = z.object({
  xml: z.string().meta({ label: 'XML', description: 'The XML string to convert' }),
  ignoreAttributes: z.boolean().default(false).meta({
    label: 'Ignore Attributes',
    description:
      'Ignore XML tag attributes during parsing. When unchecked, attributes are included with an "@_" prefix.',
  }),
});

export const convertXmlToJson = {
  slug: 'convertXmlToJson',
  label: 'Convert XML to JSON',
  description: 'Convert XML to JSON.',
  input: inputSchema,
  output: z.json().meta({ label: 'JSON' }),
  async run({ input }: PieceRunArgs<z.output<typeof inputSchema>, object, undefined>) {
    const parser = new XMLParser({
      ignoreAttributes: input.ignoreAttributes ?? false,
      ignoreDeclaration: true,
    });

    return parser.parse(input.xml);
  },
};
