import { type PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import { sendHttpRequest } from '../client.js';

const scalar = z.union([z.string(), z.number(), z.boolean()]);
const queryValue = z.union([scalar, z.array(scalar)]);
const headers = z.record(z.string(), z.string());
const inputSchema = z.object({
  method: z.enum(['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'HEAD']),
  url: z.url(),
  headers: headers.default({}),
  queryParams: z.record(z.string(), queryValue).default({}),
  authType: z.enum(['NONE', 'BASIC', 'BEARER_TOKEN']).default('NONE'),
  authFields: z
    .object({
      username: z.string().optional(),
      password: z.string().optional(),
      token: z.string().optional(),
    })
    .optional(),
  bodyType: z.enum(['none', 'form_data', 'json', 'raw']).default('none'),
  body: z.unknown().optional(),
  responseIsBinary: z.boolean().default(false),
  timeout: z.number().positive().optional(),
  followRedirects: z.boolean().default(true),
});
const output = z.object({ status: z.number().int(), headers, body: z.unknown() });

function createBody(bodyType: z.output<typeof inputSchema>['bodyType'], body: unknown) {
  if (bodyType === 'none' || body === undefined) return undefined;
  if (bodyType === 'json') return JSON.stringify(body);
  if (bodyType === 'raw') return String(body);
  const form = new FormData();
  const fields = z
    .array(z.object({ fieldName: z.string(), value: z.union([z.string(), z.instanceof(Blob)]) }))
    .parse(body);
  for (const field of fields) form.append(field.fieldName, field.value);
  return form;
}

export const sendRequest = {
  slug: 'sendRequest',
  label: 'Send HTTP request',
  description: 'Send an HTTP request and return its status, headers, and body.',
  input: inputSchema,
  output,
  async run({ input }: PieceRunArgs<z.output<typeof inputSchema>, object, undefined>) {
    const url = new URL(input.url);
    for (const [key, value] of Object.entries(input.queryParams)) {
      for (const entry of Array.isArray(value) ? value : [value]) {
        url.searchParams.append(key, String(entry));
      }
    }

    const requestHeaders = new Headers(input.headers);
    if (input.authType === 'BASIC') {
      const auth = z.object({ username: z.string(), password: z.string() }).parse(input.authFields);
      requestHeaders.set('authorization', `Basic ${btoa(`${auth.username}:${auth.password}`)}`);
    } else if (input.authType === 'BEARER_TOKEN') {
      const auth = z.object({ token: z.string() }).parse(input.authFields);
      requestHeaders.set('authorization', `Bearer ${auth.token}`);
    }

    const body = createBody(input.bodyType, input.body);
    if (input.bodyType === 'json' && !requestHeaders.has('content-type')) {
      requestHeaders.set('content-type', 'application/json');
    }

    const response = await sendHttpRequest({
      url,
      init: {
        method: input.method,
        headers: requestHeaders,
        body,
        redirect: input.followRedirects ? 'follow' : 'manual',
        signal: input.timeout ? AbortSignal.timeout(input.timeout * 1000) : undefined,
      },
    });

    const responseHeaders = Object.fromEntries(response.headers.entries());
    const responseBody = input.responseIsBinary
      ? Buffer.from(await response.arrayBuffer()).toString('base64')
      : await response.text().then((text) => {
          if (!text) return undefined;
          try {
            return JSON.parse(text) as unknown;
          } catch {
            return text;
          }
        });

    if (!response.ok) {
      throw new Error(`HTTP request failed with ${response.status} ${response.statusText}`.trim());
    }

    return { status: response.status, headers: responseHeaders, body: responseBody };
  },
};
