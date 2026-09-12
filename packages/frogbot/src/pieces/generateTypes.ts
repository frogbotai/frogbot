import { compile } from 'json-schema-to-typescript';
import { z } from 'zod';

import { pieceFactoryDefinition } from './definePiece.js';

type JSONSchema = Parameters<typeof compile>[0];

function objectSchema(properties: Record<string, JSONSchema>): JSONSchema {
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

export async function generatePieceTypes({ piece }: { piece: object }): Promise<string> {
  const definition = pieceFactoryDefinition(piece);
  const name = `${definition.slug.replace(/(^|[^a-zA-Z0-9])([a-zA-Z0-9])/g, (_, _prefix, letter: string) => letter.toUpperCase())}Types`;
  if (!/^[A-Za-z_$][\w$]*$/.test(name)) {
    throw new Error(`[frogbot] Piece slug '${definition.slug}' cannot form a type name.`);
  }
  const schema = (
    value: z.ZodType | undefined,
    path: string,
    io: 'input' | 'output',
  ): JSONSchema => {
    if (!value) return {};
    const rebase = (node: unknown, dictionary = false): unknown => {
      if (Array.isArray(node)) return node.map((entry) => rebase(entry));
      if (!node || typeof node !== 'object') return node;
      return Object.fromEntries(
        Object.entries(node).flatMap(([key, entry]): [string, unknown][] => {
          if (dictionary) return [[key, rebase(entry)]];
          if ((key === '$id' || key === '$schema') && typeof entry === 'string') return [];
          if (key === '$ref' && typeof entry === 'string' && entry.startsWith('#')) {
            return [[key, `#${path}${entry.slice(1)}`]];
          }
          if (['const', 'default', 'enum', 'examples'].includes(key)) return [[key, entry]];
          const entries = [
            'properties',
            'patternProperties',
            '$defs',
            'definitions',
            'dependentSchemas',
            'dependencies',
          ].includes(key);
          return [[key, rebase(entry, entries)]];
        }),
      );
    };
    return rebase(z.toJSONSchema(value, { io })) as JSONSchema;
  };
  const actions = (
    entries: readonly { slug: string; input: z.ZodType; output?: z.ZodType }[],
    category: 'actions' | 'triggers',
  ) =>
    objectSchema(
      Object.fromEntries(
        entries.map((entry) => [
          entry.slug,
          objectSchema({
            input: schema(
              entry.input,
              `/properties/${category}/properties/${entry.slug}/properties/input`,
              'output',
            ),
            output: schema(
              entry.output,
              `/properties/${category}/properties/${entry.slug}/properties/output`,
              category === 'actions' ? 'input' : 'output',
            ),
          }),
        ]),
      ),
    );
  return compile(
    objectSchema({
      auth: schema(definition.auth, '/properties/auth', 'output'),
      options: definition.options
        ? schema(definition.options, '/properties/options', 'output')
        : objectSchema({}),
      actions: actions(definition.actions, 'actions'),
      triggers: actions(definition.triggers ?? [], 'triggers'),
    }),
    name,
    { bannerComment: '', unknownAny: true, additionalProperties: false },
  );
}
