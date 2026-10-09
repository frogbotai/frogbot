import { z } from 'zod';

import type { FrogBotRequest } from '../types/request.js';
import { createPieceFile, filesCollectionSlug } from './files.js';
import type { PieceActionDefinition } from './types.js';

const scalar = z.union([z.string(), z.number(), z.boolean()]);

export const customApiCallInput = z
  .object({
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']),
    path: z.string().min(1).describe('API path relative to the piece base URL.'),
    query: z
      .record(z.string(), z.union([scalar, z.array(scalar)]))
      .optional()
      .describe('Query parameters. Array values are sent as repeated keys.'),
    headers: z.record(z.string(), z.string()).optional(),
    bodyType: z.enum(['json', 'form', 'raw', 'formData']).default('json'),
    body: z.unknown().optional(),
    responseType: z.enum(['json', 'text', 'binary']).default('json'),
    fileName: z.string().min(1).optional().describe('Name of the saved file for binary responses.'),
    failsafe: z
      .boolean()
      .default(false)
      .describe('Return the response instead of throwing on a non-2xx status.'),
    timeoutSeconds: z.number().positive().max(3600).default(30),
  })
  .refine((input) => !['GET', 'HEAD'].includes(input.method) || input.body === undefined, {
    message: 'GET and HEAD requests cannot have a body.',
    path: ['body'],
  });

export const customApiCallOutput = z.object({
  status: z.number().int(),
  headers: z.record(z.string(), z.string()),
  body: z.unknown(),
});

export type CustomApiCallInput = z.input<typeof customApiCallInput>;

export type CustomApiCallOutput = z.output<typeof customApiCallOutput>;

export type CustomApiCallFile = {
  id: number | string;
  name: string;
  mimeType: string;
  size: number;
  url: string | null;
};

export type CustomApiCallConfig<TClient> = {
  /** The service name used in descriptions and error messages, for example `'Gmail'`. */
  name: string;
  description?: string;
  /** The URL every path is appended to, for example `'https://api.notion.com/v1'`. */
  baseUrl: string | ((client: TClient) => string);
  /** Adds the credential to the final URL or headers. It runs after every caller check. */
  authorize(args: {
    client: TClient;
    url: URL;
    headers: Headers;
    req: FrogBotRequest;
  }): void | Promise<void>;
  /** A pattern the path, with a leading `/` and without its query, must match. */
  path?: RegExp;
  /** Header names a caller may not set, on top of `Authorization`, `Cookie` and `Host`. */
  reservedHeaders?: readonly string[];
  /** Headers sent with every call. A caller header of the same name replaces one. */
  headers?: Record<string, string>;
  /** Send a `json` object body form-encoded, for APIs that take no JSON. */
  bodyEncoding?: 'form';
  /** How form bodies send a top-level array of scalars: `a=1&a=2` (default) or `a[0]=1&a[1]=2`, as Stripe needs. */
  formArrays?: 'repeat' | 'index';
  /** Throws for a 2xx response that reports a failure, such as Slack's `ok: false`. */
  check?(response: CustomApiCallOutput): void;
};

export type CustomApiCallAction<TOptions, TClient> = PieceActionDefinition<
  typeof customApiCallInput,
  typeof customApiCallOutput,
  TOptions,
  TClient
> & { slug: 'customApiCall' };

type Input = z.output<typeof customApiCallInput>;

const alwaysReserved = ['authorization', 'proxy-authorization', 'cookie', 'host'];
const errorBodyLength = 500;

function requestTarget(name: string, path: string, rule: RegExp | undefined) {
  const [rawPath = '', search = ''] = path.split(/\?(.*)/s);

  if (
    /^[a-z][a-z\d+.-]*:/i.test(rawPath) ||
    rawPath.startsWith('@') ||
    path.includes('#') ||
    /[\s\p{Cc}\\]/u.test(rawPath) ||
    rawPath.includes('//') ||
    rawPath.split('/').some((segment) => /^(?:\.|%2e){1,2}$/i.test(segment))
  ) {
    throw new Error(`[frogbot] ${name} custom API path must be relative to the ${name} API.`);
  }

  const pathname = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;

  if (rule && !rule.test(pathname)) {
    throw new Error(`[frogbot] ${name} custom API path '${pathname}' is not allowed.`);
  }

  return { pathname, search };
}

function appendForm(
  params: URLSearchParams | FormData,
  key: string,
  value: unknown,
  arrays: 'repeat' | 'index',
): void {
  if (value === undefined || value === null) return;

  if (Array.isArray(value)) {
    const indexed =
      !key.endsWith('[]') &&
      (arrays === 'index' ||
        key.includes('[') ||
        value.some((item) => item !== null && typeof item === 'object'));

    value.forEach((item, index) =>
      appendForm(params, indexed ? `${key}[${index}]` : key, item, arrays),
    );

    return;
  }

  if (typeof value === 'object') {
    Object.entries(value).forEach(([child, entry]) =>
      appendForm(params, `${key}[${child}]`, entry, arrays),
    );

    return;
  }

  params.append(key, String(value));
}

function formBody<T extends URLSearchParams | FormData>(
  name: string,
  body: unknown,
  form: T,
  arrays: 'repeat' | 'index',
): T {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error(`[frogbot] ${name} custom API form bodies must be objects.`);
  }

  Object.entries(body).forEach(([key, value]) => appendForm(form, key, value, arrays));

  return form;
}

function fileNameFrom(pathname: string): string {
  const segment = pathname.split('/').pop() || 'download';

  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function requestBody(
  name: string,
  input: Input,
  headers: Headers,
  {
    bodyEncoding,
    formArrays = 'repeat',
  }: Pick<CustomApiCallConfig<unknown>, 'bodyEncoding' | 'formArrays'>,
): BodyInit | undefined {
  if (input.body === undefined) return undefined;

  if (input.bodyType === 'raw') {
    if (typeof input.body !== 'string') {
      throw new Error(`[frogbot] ${name} custom API raw bodies must be strings.`);
    }

    return input.body;
  }

  if (input.bodyType === 'formData') {
    return formBody(name, input.body, new FormData(), formArrays);
  }

  if (input.bodyType === 'form' || bodyEncoding === 'form') {
    return formBody(name, input.body, new URLSearchParams(), formArrays);
  }

  if (!headers.has('content-type')) headers.set('content-type', 'application/json');

  return JSON.stringify(input.body);
}

function parseBody(text: string, contentType: string | null, input: Input): unknown {
  if (!text) return null;
  if (input.responseType === 'text') return text;
  if (contentType && !/[/+]json\b/i.test(contentType)) return text;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function saveBinary(
  name: string,
  response: Response,
  data: Buffer,
  input: Input,
  pathname: string,
  req: FrogBotRequest,
): Promise<CustomApiCallFile> {
  const fileName = input.fileName ?? fileNameFrom(pathname);
  const mimeType =
    response.headers.get('content-type')?.split(';')[0]?.trim() || 'application/octet-stream';

  req.signal?.throwIfAborted();
  const doc = await createPieceFile(req, name, {
    file: { data, mimetype: mimeType, name: fileName, size: data.length },
    req,
    overrideAccess: false,
  });

  return {
    id: doc.id,
    name: fileName,
    mimeType,
    size: data.length,
    url: typeof doc.url === 'string' ? doc.url : null,
  };
}

export function defineCustomApiCall<TOptions, TClient>(
  config: CustomApiCallConfig<TClient>,
): CustomApiCallAction<TOptions, TClient> {
  const { name } = config;
  const reserved = new Set([
    ...alwaysReserved,
    ...(config.reservedHeaders ?? []).map((header) => header.toLowerCase()),
  ]);

  return {
    slug: 'customApiCall',
    description:
      config.description ??
      `Call any ${name} API endpoint with the connected credential. Returns { status, headers, body }.`,
    input: customApiCallInput,
    output: customApiCallOutput,
    idempotent: false,
    async run({ client, input, req }): Promise<CustomApiCallOutput> {
      const { pathname, search } = requestTarget(name, input.path, config.path);

      if (input.responseType === 'binary') filesCollectionSlug(req, name);

      for (const header of Object.keys(input.headers ?? {})) {
        if (reserved.has(header.toLowerCase())) {
          throw new Error(`[frogbot] ${name} custom API calls cannot set the '${header}' header.`);
        }
      }

      const baseUrl =
        typeof config.baseUrl === 'function' ? config.baseUrl(client) : config.baseUrl;

      const url = new URL(`${baseUrl.replace(/\/+$/, '')}${pathname}`);

      new URLSearchParams(search).forEach((value, key) => url.searchParams.append(key, value));

      for (const [key, value] of Object.entries(input.query ?? {})) {
        for (const item of Array.isArray(value) ? value : [value]) {
          url.searchParams.append(key, String(item));
        }
      }

      const headers = new Headers(config.headers);

      for (const [header, value] of Object.entries(input.headers ?? {})) {
        headers.set(header, value);
      }

      const body = requestBody(name, input, headers, config);
      const timeout = AbortSignal.timeout(input.timeoutSeconds * 1000);
      const signal = req.signal ? AbortSignal.any([req.signal, timeout]) : timeout;

      signal.throwIfAborted();
      await config.authorize({ client, url, headers, req });

      const read = <T>(promise: Promise<T>) =>
        promise.catch((error: unknown) => {
          if (timeout.aborted && !req.signal?.aborted) {
            throw new Error(
              `[frogbot] ${name} API request timed out after ${input.timeoutSeconds} seconds.`,
            );
          }

          throw error;
        });

      const response = await read(
        fetch(url, { method: input.method, headers, body, redirect: 'manual', signal }),
      );

      const ok = response.status >= 200 && response.status < 300;
      const responseHeaders = Object.fromEntries(response.headers);

      if (ok && input.responseType === 'binary' && input.method !== 'HEAD') {
        const data = Buffer.from(await read(response.arrayBuffer()));

        return {
          status: response.status,
          headers: responseHeaders,
          body: await saveBinary(name, response, data, input, pathname, req),
        };
      }

      const text = input.method === 'HEAD' ? '' : await read(response.text());
      const result = {
        status: response.status,
        headers: responseHeaders,
        body: parseBody(text, response.headers.get('content-type'), input),
      };

      if (ok) {
        config.check?.(result);

        return result;
      }

      if (input.failsafe) return result;

      if (response.status >= 300 && response.status < 400) {
        throw new Error(
          `${name} API redirected (${response.status}) to ${response.headers.get('location')}.`,
        );
      }

      const detail = text.slice(0, errorBodyLength);

      throw new Error(
        `[frogbot] ${name} API request failed (${response.status})${detail ? `: ${detail}` : '.'}`,
      );
    },
  };
}
