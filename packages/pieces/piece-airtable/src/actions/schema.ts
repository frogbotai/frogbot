import { z } from 'zod';

import { defineAction } from '../define.js';
import { baseOptions, tableOptions } from '../options.js';
import { baseSchema, fieldSchema, tableSchema } from '../schemas.js';

const fieldConfig = fieldSchema.omit({ id: true });
const tableConfig = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  fields: z.tuple([fieldConfig], fieldConfig),
});

const createBaseInput = z.object({
  workspaceId: z.string().min(1).meta({ label: 'Workspace ID' }),
  name: z.string().min(1).meta({ label: 'Base name' }),
  tables: z.tuple([tableConfig], tableConfig).meta({ label: 'Tables' }),
});

export const createBase = defineAction({
  slug: 'createBase',
  description: 'Create a base with its initial table structure.',
  input: createBaseInput,
  output: z.object({ id: z.string(), tables: z.array(tableSchema) }).passthrough(),
  async run({ client, input, req }) {
    return client.request({
      method: 'POST',
      path: '/meta/bases',
      body: input,
      signal: req.signal ?? undefined,
    });
  },
});

const createTableInput = z.object({
  baseId: z.string().min(1).meta({ label: 'Base' }),
  name: z.string().min(1).meta({ label: 'Table name' }),
  description: z.string().optional().meta({ label: 'Description' }),
  fields: z.tuple([fieldConfig], fieldConfig).meta({ label: 'Fields' }),
});

export const createTable = defineAction({
  slug: 'createTable',
  description: 'Create a table in an existing base.',
  input: createTableInput,
  output: tableSchema,
  options: { baseId: baseOptions },
  async run({ client, input, req }) {
    const { baseId, ...body } = input;

    return client.request({
      method: 'POST',
      path: `/meta/bases/${baseId}/tables`,
      body,
      signal: req.signal ?? undefined,
    });
  },
});

const findBasesInput = z.object({
  name: z.string().min(1).meta({ label: 'Base name or keyword' }),
});

export const findBases = defineAction({
  slug: 'findBases',
  description: 'Find bases whose names contain a keyword.',
  input: findBasesInput,
  output: z.array(baseSchema),
  async run({ client, input, req }) {
    const bases = await client.listAll<z.output<typeof baseSchema>>({
      path: '/meta/bases',
      key: 'bases',
      signal: req.signal ?? undefined,
    });

    const term = input.name.toLowerCase();

    return bases.filter(({ name }) => name.toLowerCase().includes(term));
  },
});

const baseInput = z.object({ baseId: z.string().min(1).meta({ label: 'Base' }) });

export const getBaseSchema = defineAction({
  slug: 'getBaseSchema',
  description: 'Get all tables and fields in a base.',
  input: baseInput,
  output: z.array(tableSchema),
  options: { baseId: baseOptions },
  async run({ client, input, req }) {
    return client.listAll({
      path: `/meta/bases/${input.baseId}/tables`,
      key: 'tables',
      signal: req.signal ?? undefined,
    });
  },
});

const getTableInput = baseInput.extend({ tableId: z.string().min(1).meta({ label: 'Table' }) });

export const getTable = defineAction({
  slug: 'getTable',
  description: 'Get one table and its schema by ID.',
  input: getTableInput,
  output: tableSchema,
  options: { baseId: baseOptions, tableId: tableOptions },
  async run({ client, input, req }) {
    const tables = await client.listAll<z.output<typeof tableSchema>>({
      path: `/meta/bases/${input.baseId}/tables`,
      key: 'tables',
      signal: req.signal ?? undefined,
    });

    const selected = tables.find(({ id }) => id === input.tableId);

    if (!selected) throw new Error(`Airtable table '${input.tableId}' was not found.`);

    return selected;
  },
});

const findTableInput = baseInput.extend({
  name: z.string().min(1).meta({ label: 'Table name' }),
});

export const findTable = defineAction({
  slug: 'findTable',
  description: 'Find a table by its exact name.',
  input: findTableInput,
  output: tableSchema.nullable(),
  options: { baseId: baseOptions },
  async run({ client, input, req }) {
    const tables = await client.listAll<z.output<typeof tableSchema>>({
      path: `/meta/bases/${input.baseId}/tables`,
      key: 'tables',
      signal: req.signal ?? undefined,
    });

    return tables.find(({ name }) => name.toLowerCase() === input.name.toLowerCase()) ?? null;
  },
});
