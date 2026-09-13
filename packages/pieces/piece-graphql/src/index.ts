import { definePiece, type PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import { GraphqlRequestError, sendGraphqlRequest } from './client.js';

const scalar = z.union([z.string(), z.number(), z.boolean()]);
const endpoint = z.url().refine((value) => {
  const protocol = new URL(value).protocol;

  return protocol === 'http:' || protocol === 'https:';
}, 'URL must use HTTP or HTTPS.');

const graphqlError = z
  .object({
    message: z.string(),
    locations: z.array(z.object({ line: z.number().int(), column: z.number().int() })).optional(),
    path: z.array(z.union([z.string(), z.number().int()])).optional(),
    extensions: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

const graphqlBody = z
  .object({
    data: z.unknown().optional(),
    errors: z.array(graphqlError).optional(),
    extensions: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

const inputSchema = z.object({
  method: z.enum(['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'HEAD']).default('POST'),
  url: endpoint,
  queryParams: z.record(z.string(), z.union([scalar, z.array(scalar)])).default({}),
  headers: z.record(z.string(), z.string()).default({}),
  query: z.string(),
  variables: z.record(z.string(), z.unknown()).optional(),
  useProxy: z.boolean().default(false),
  proxySettings: z
    .object({
      host: z.string().min(1),
      port: z.number().int().min(1).max(65_535),
      username: z.string().optional(),
      password: z.string().optional(),
    })
    .optional(),
  timeout: z.number().positive().optional(),
  failsafe: z.boolean().default(false),
});

const output = z.object({
  status: z.number().int(),
  headers: z.record(z.string(), z.string()),
  body: z.union([graphqlBody, z.string(), z.undefined()]),
});

const sendRequest = {
  slug: 'sendRequest',
  label: 'Send GraphQL request',
  description: 'Send a query or mutation to a GraphQL endpoint.',
  input: inputSchema,
  output,
  async run({ input }: PieceRunArgs<z.output<typeof inputSchema>, object, undefined>) {
    const url = new URL(input.url);

    for (const [name, value] of Object.entries(input.queryParams)) {
      for (const entry of Array.isArray(value) ? value : [value]) {
        url.searchParams.append(name, String(entry));
      }
    }

    if (input.useProxy && !input.proxySettings) {
      throw new Error('Proxy settings are required when useProxy is enabled.');
    }

    const hasBody = input.method !== 'GET' && input.method !== 'HEAD';

    if (!hasBody) {
      url.searchParams.set('query', input.query);

      if (input.variables !== undefined) {
        url.searchParams.set('variables', JSON.stringify(input.variables));
      }
    }

    const body = hasBody
      ? JSON.stringify({ query: input.query, variables: input.variables })
      : undefined;

    try {
      return await sendGraphqlRequest({
        method: input.method,
        url,
        headers: {
          ...(hasBody ? { 'content-type': 'application/json' } : {}),
          ...input.headers,
        },
        body,
        timeout: input.timeout,
        proxy: input.useProxy ? input.proxySettings : undefined,
      });
    } catch (error) {
      if (!input.failsafe) throw error;

      if (error instanceof GraphqlRequestError && error.response) return error.response;

      return {
        status: 0,
        headers: {},
        body: {
          errors: [{ message: error instanceof Error ? error.message : String(error) }],
        },
      };
    }
  },
};

export const graphqlActions = ['sendRequest'] as const;

export const createGraphql = definePiece({
  slug: 'graphql',
  label: 'GraphQL',
  admin: { description: 'Send GraphQL queries and mutations', group: 'Core' },
  actions: [sendRequest],
});
