import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { sanitize } from '../../../../packages/frogbot/src/config/sanitize.js';
import type { FrogBotConfig } from '../../../../packages/frogbot/src/config/types.js';
import type { MapVectorFieldArgs } from '../../../../packages/frogbot/src/database/types.js';
import { sanitizeVectorFields } from '../../../../packages/frogbot/src/fields/config/sanitizeVector.js';
import type {
  JSONField,
  VectorField,
} from '../../../../packages/frogbot/src/fields/config/types.js';
import { validateVector } from '../../../../packages/frogbot/src/fields/validations.js';
import { writeGeneratedTypes } from '../../../../packages/frogbot/src/typegen/index.js';

function config(fields: FrogBotConfig['collections'][number]['fields']): FrogBotConfig {
  return {
    secret: 'test-secret',
    db: { defaultIDType: 'number' } as FrogBotConfig['db'],
    collections: [{ slug: 'documents', fields }],
  };
}

describe('vector fields', () => {
  let typegenDir: string | undefined;

  afterEach(async () => {
    if (typegenDir) await rm(typegenDir, { recursive: true, force: true });

    typegenDir = undefined;
  });

  it.each([0, -1, 1.2, NaN, Infinity, -Infinity, '3', null])(
    'rejects non-positive integer dimensions %s at configuration time',
    (dimensions) => {
      expect(() =>
        sanitize(
          config([{ name: 'embedding', type: 'vector', dimensions } as unknown as VectorField]),
        ),
      ).toThrow(
        "Vector field 'embedding' in collection 'documents' requires positive integer dimensions",
      );
    },
  );

  it.each([
    [[1, 2], 'exactly 3'],
    [[], 'exactly 3'],
    ['[1,2,3]', 'array of finite numbers'],
    [{ 0: 1, 1: 2, 2: 3 }, 'array of finite numbers'],
    [[1, '2', 3], 'only finite numbers'],
    [[1, NaN, 3], 'only finite numbers'],
    [[1, Infinity, 3], 'only finite numbers'],
    [[1, -Infinity, 3], 'only finite numbers'],
  ] as const)('rejects malformed vector %j', (value, error) => {
    expect(validateVector(value, 3, false)).toContain(error);
  });

  it('accepts finite vectors and optional missing or null values', () => {
    expect(validateVector([0, -0.5, 1], 3, true)).toBe(true);
    expect(validateVector(undefined, 3, false)).toBe(true);
    expect(validateVector(null, 3, false)).toBe(true);
    expect(validateVector(null, 3, true)).toBe('A vector is required.');
    expect(validateVector(undefined, 3, true)).toBe('A vector is required.');
  });

  it('lowers a vector field without a search index in the runtime collection', async () => {
    const result = sanitize(
      config([
        { name: 'title', type: 'text' },
        { name: 'embedding', type: 'vector', dimensions: 3 },
      ]),
    );

    const runtime = await result._internal.payloadConfig;
    const fields = runtime.collections.find(({ slug }) => slug === 'documents')?.fields;

    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'title', type: 'text' }),
        expect.objectContaining({
          name: 'embedding',
          type: 'json',
          custom: { frogbot: { vector: { dimensions: 3 } } },
        }),
      ]),
    );
  });

  it('preserves custom metadata, existing hooks, admin settings, and composed validation', async () => {
    const beforeValidate = vi.fn(({ value }) => value);
    const beforeChange = vi.fn(({ value }) => value);
    const validate = vi.fn(() => 'user validation failed');
    const field: VectorField = {
      name: 'embedding',
      type: 'vector',
      dimensions: 3,
      admin: { hidden: true },
      custom: { source: 'user', frogbot: { feature: 'other' } },
      hooks: { beforeValidate: [beforeValidate], beforeChange: [beforeChange] },
      validate,
    };

    const result = sanitizeVectorFields({
      collection: 'documents',
      fields: [field],
    })[0] as JSONField;

    expect(result).toMatchObject({
      name: 'embedding',
      type: 'json',
      admin: { hidden: true },
      custom: { source: 'user', frogbot: { feature: 'other', vector: { dimensions: 3 } } },
    });
    expect(field.type).toBe('vector');
    expect(field.hooks?.beforeValidate).toHaveLength(1);

    expect(result.type).toBe('json');
    expect(result.hooks?.beforeChange?.[0]).toBe(beforeChange);
    expect(result.hooks?.beforeChange).toHaveLength(2);
    expect(result.hooks?.beforeValidate).toHaveLength(1);

    const invalid = await result.validate?.([1, 2] as never, { required: false } as never);
    const custom = await result.validate?.([1, 2, 3] as never, { required: false } as never);

    expect(invalid).toContain('exactly 3');
    expect(validate).toHaveBeenCalledTimes(1);
    expect(custom).toBe('user validation failed');

    await result.hooks?.beforeValidate?.[0]({ value: [1, 2, 3] } as never);

    expect(beforeValidate).toHaveBeenCalledOnce();

    expect(() =>
      result.hooks?.beforeChange?.[1]({ value: [1, NaN, 3], path: ['embedding'] } as never),
    ).toThrow('embedding');
  });

  it('lowers vectors inside groups, tabs, rows, collapsibles, arrays and blocks', () => {
    const nested = sanitizeVectorFields({
      collection: 'documents',
      fields: [
        {
          name: 'group',
          type: 'group',
          fields: [
            {
              type: 'tabs',
              tabs: [
                {
                  label: 'Details',
                  name: 'details',
                  fields: [
                    {
                      type: 'row',
                      fields: [
                        {
                          type: 'collapsible',
                          label: 'Values',
                          fields: [
                            {
                              name: 'items',
                              type: 'array',
                              fields: [{ name: 'embedding', type: 'vector', dimensions: 3 }],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          name: 'content',
          type: 'blocks',
          blocks: [
            { slug: 'note', fields: [{ name: 'embedding', type: 'vector', dimensions: 3 }] },
          ],
          blockReferences: [
            { slug: 'referenced', fields: [{ name: 'embedding', type: 'vector', dimensions: 3 }] },
          ],
        },
      ],
    });

    expect(JSON.stringify(nested)).not.toContain('"type":"vector"');
    expect(JSON.stringify(nested).match(/"vector":\{"dimensions":3\}/g)).toHaveLength(3);
  });

  it('lowers vectors in shared root blocks referenced by a collection', async () => {
    const input = config([
      { name: 'content', type: 'blocks', blocks: [], blockReferences: ['shared'] },
    ]);

    input.blocks = [
      { slug: 'shared', fields: [{ name: 'embedding', type: 'vector', dimensions: 3 }] },
    ];

    const runtime = await sanitize(input)._internal.payloadConfig;
    const shared = runtime.blocks?.find((block) => block.slug === 'shared');

    expect(shared?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'embedding',
          type: 'json',
          custom: { frogbot: { vector: { dimensions: 3 } } },
        }),
      ]),
    );
  });

  it('lets the database adapter map lowered vector fields to native storage', async () => {
    const mapVectorField = vi.fn(({ field }: MapVectorFieldArgs) => ({
      ...field,
      custom: { ...field.custom, storage: 'native' },
    }));

    const input = config([
      { name: 'title', type: 'text' },
      { name: 'embedding', type: 'vector', dimensions: 3 },
    ]);

    input.db = { ...input.db, mapVectorField };
    input.blocks = [
      { slug: 'shared', fields: [{ name: 'embedding', type: 'vector', dimensions: 2 }] },
    ];

    const runtime = await sanitize(input)._internal.payloadConfig;
    const fields = runtime.collections.find(({ slug }) => slug === 'documents')?.fields;

    expect(mapVectorField).toHaveBeenCalledWith({
      collection: 'documents',
      block: undefined,
      dimensions: 3,
      path: 'embedding',
      field: expect.objectContaining({
        type: 'json',
        custom: { frogbot: { vector: { dimensions: 3 } } },
      }),
    });
    expect(mapVectorField).toHaveBeenCalledWith(
      expect.objectContaining({ block: 'shared', collection: undefined, dimensions: 2 }),
    );
    expect(mapVectorField).toHaveBeenCalledTimes(2);
    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'embedding',
          custom: expect.objectContaining({ storage: 'native' }),
        }),
      ]),
    );
  });

  it('names the shared block when root block vector dimensions are invalid', () => {
    const input = config([{ name: 'title', type: 'text' }]);

    input.blocks = [
      {
        slug: 'shared',
        fields: [{ name: 'embedding', type: 'vector', dimensions: 0 } as VectorField],
      },
    ];

    expect(() => sanitize(input)).toThrow(
      "Vector field 'embedding' in block 'shared' requires positive integer dimensions",
    );
  });

  it('generates number arrays, nullable optional fields, and nested vectors without an index', async () => {
    typegenDir = await mkdtemp(join(tmpdir(), 'frogbot-vector-types-'));

    const built = sanitize(
      config([
        { name: 'embedding', type: 'vector', dimensions: 3, required: true },
        { name: 'optionalEmbedding', type: 'vector', dimensions: 3 },
        {
          name: 'group',
          type: 'group',
          fields: [{ name: 'nestedEmbedding', type: 'vector', dimensions: 3 }],
        },
      ]),
    );

    const { outputPath } = await writeGeneratedTypes(built, typegenDir);
    const output = await readFile(outputPath, 'utf8');

    expect(output).toMatch(/embedding: number\[\];/);
    expect(output).toMatch(/optionalEmbedding\?: number\[\] \| null;/);
    expect(output).toMatch(/nestedEmbedding\?: number\[\] \| null;/);
    expect(output).not.toMatch(/embedding: \[number/);
  });
});
