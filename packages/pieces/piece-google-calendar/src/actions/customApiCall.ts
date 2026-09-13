import type { PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import { type GoogleCalendar, requestOptions } from '../client.js';

const baseUrl = 'https://www.googleapis.com/calendar/v3';
const scalar = z.union([z.string(), z.number(), z.boolean()]);
const formField = z.discriminatedUnion('type', [
  z.object({ name: z.string().min(1), type: z.literal('text'), value: z.string() }),
  z.object({
    name: z.string().min(1),
    type: z.literal('file'),
    filename: z.string().min(1),
    contentType: z.string().min(1).default('application/octet-stream'),
    base64: z.base64(),
  }),
]);

function providerUrl(path: string) {
  if (/[\s\\\p{Cc}]/u.test(path) || path.startsWith('//')) {
    throw new Error('URL must target the Google Calendar v3 API.');
  }
  const url = new URL(path.startsWith('/') ? `${baseUrl}${path}` : path);
  if (
    url.origin !== 'https://www.googleapis.com' ||
    url.username ||
    url.password ||
    url.hash ||
    (url.pathname !== '/calendar/v3' && !url.pathname.startsWith('/calendar/v3/'))
  ) {
    throw new Error('URL must target the Google Calendar v3 API.');
  }
  let decoded = url.pathname;
  for (let index = 0; index < 3; index++) {
    decoded = decodeURIComponent(decoded);
    if (
      decoded.split('/').some((part) => part === '.' || part === '..') ||
      /[\\\p{Cc}]/u.test(decoded)
    ) {
      throw new Error('URL must target the Google Calendar v3 API.');
    }
    if (!/%[\da-f]{2}/i.test(decoded)) break;
  }
  return url.toString();
}

const inputSchema = z
  .object({
    method: z.enum(['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'HEAD', 'OPTIONS']),
    path: z
      .string()
      .min(1)
      .refine((path) => {
        try {
          providerUrl(path);
          return true;
        } catch {
          return false;
        }
      }, 'URL must target the Google Calendar v3 API.'),
    headers: z
      .record(z.string(), z.string())
      .default({})
      .refine(
        (headers) =>
          Object.keys(headers).every(
            (name) =>
              ![
                'authorization',
                'proxy-authorization',
                'host',
                'cookie',
                'content-length',
                'transfer-encoding',
              ].includes(name.toLowerCase()),
          ),
        'Authentication and transport headers cannot be overridden.',
      ),
    query: z.record(z.string(), z.union([scalar, z.array(scalar)])).optional(),
    bodyType: z.enum(['none', 'json', 'raw', 'formData']).default('json'),
    body: z.json().optional(),
    formData: z.array(formField).optional(),
    responseIsBinary: z.boolean().default(false),
    failsafe: z.boolean().default(false),
    timeout: z.number().positive().optional().describe('Request timeout in seconds.'),
    followRedirects: z.literal(false).default(false),
  })
  .superRefine((input, context) => {
    if (input.bodyType === 'raw' && typeof input.body !== 'string') {
      context.addIssue({ code: 'custom', path: ['body'], message: 'Raw body must be a string.' });
    }
    if (input.bodyType === 'formData' && !input.formData) {
      context.addIssue({
        code: 'custom',
        path: ['formData'],
        message: 'Form data fields are required.',
      });
    }
    if (
      ['GET', 'HEAD'].includes(input.method) &&
      (input.body !== undefined || input.formData !== undefined)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['body'],
        message: 'GET and HEAD requests cannot have a body.',
      });
    }
  });

export const customApiCall = {
  slug: 'customApiCall',
  description:
    'Call the authenticated Google Calendar v3 API. Supports JSON, raw text, multipart text and base64 files, and base64 binary responses. Redirects are rejected.',
  input: inputSchema,
  output: z.object({
    status: z.number().int(),
    headers: z.record(z.string(), z.string()),
    body: z.union([z.json(), z.object({ base64: z.string(), contentType: z.string() })]),
  }),
  idempotent: false,
  async run({
    client,
    input,
    req,
  }: PieceRunArgs<z.output<typeof inputSchema>, object, GoogleCalendar>) {
    const transport = client.context._options.auth;
    if (!transport || typeof transport === 'string' || !('request' in transport)) {
      throw new Error('Google Calendar client is missing authenticated transport.');
    }
    const headers = new Headers(input.headers);
    let data: unknown = input.bodyType === 'none' ? undefined : input.body;
    if (input.bodyType === 'json' && data !== undefined) {
      data = JSON.stringify(data);
      if (!headers.has('content-type')) headers.set('content-type', 'application/json');
    }
    if (input.bodyType === 'raw' && !headers.has('content-type')) {
      headers.set('content-type', 'text/plain');
    }
    if (input.bodyType === 'formData') {
      const form = new FormData();
      for (const field of input.formData ?? []) {
        if (field.type === 'text') form.append(field.name, field.value);
        else {
          form.append(
            field.name,
            new Blob([Buffer.from(field.base64, 'base64')], { type: field.contentType }),
            field.filename,
          );
        }
      }
      headers.delete('content-type');
      data = form;
    }
    const response = await transport.request({
      ...requestOptions(req),
      url: providerUrl(input.path),
      method: input.method,
      headers,
      params: input.query,
      data,
      timeout: input.timeout === undefined ? undefined : input.timeout * 1000,
      responseType: input.responseIsBinary ? 'arraybuffer' : 'json',
      redirect: 'manual',
      maxRedirects: 0,
      validateStatus: (status) => (status >= 200 && status < 300) || input.failsafe,
    });
    if (response.status >= 300 && response.status < 400) {
      throw new Error('Google Calendar API redirects are not allowed.');
    }
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: input.responseIsBinary
        ? {
            base64: Buffer.from(response.data as ArrayBuffer).toString('base64'),
            contentType: response.headers.get('content-type') ?? 'application/octet-stream',
          }
        : (response.data ?? null),
    };
  },
};
