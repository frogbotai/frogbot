import { type PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

const inputSchema = z.object({ url: z.string(), returnArrays: z.boolean().default(false) });
const output = z.object({
  baseUrl: z.string(),
  domain: z.string(),
  path: z.string(),
  queryParameters: z.record(z.string(), z.union([z.string(), z.array(z.string()), z.null()])),
  hash: z.string(),
});

export const parseUrl = {
  slug: 'parseUrl',
  label: 'Parse URL',
  description: 'Extract the domain, path, and query parameters from a URL.',
  input: inputSchema,
  output,
  async run({ input }: PieceRunArgs<z.output<typeof inputSchema>, object, undefined>) {
    try {
      const url = new URL(input.url);
      const queryParameters: Record<string, string | string[] | null> = {};
      for (const key of new Set(url.searchParams.keys())) {
        queryParameters[key] = input.returnArrays
          ? url.searchParams.getAll(key)
          : url.searchParams.get(key);
      }
      return {
        baseUrl: `${url.protocol}//${url.host}`,
        domain: url.hostname,
        path: url.pathname,
        queryParameters,
        hash: url.hash.slice(1),
      };
    } catch (error) {
      throw new Error(
        `Failed to parse URL. Please ensure it is a valid, absolute URL. Details: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
};
