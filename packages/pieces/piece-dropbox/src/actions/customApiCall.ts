import { z } from 'zod';

import { type DropboxRunArgs, requestSignal } from '../client.js';
import { fileReference, loadFile, responseBytes, saveFile } from '../files.js';
import { savedFile } from '../schemas.js';

const inputSchema = z
  .object({
    method: z.enum(['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'HEAD']),
    path: z.string().min(1),
    headers: z.record(z.string(), z.string()).default({}),
    query: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
    body: z
      .discriminatedUnion('type', [
        z.object({ type: z.literal('json'), value: z.json() }),
        z.object({ type: z.literal('raw'), value: z.string() }),
        z.object({
          type: z.literal('formData'),
          fields: z.array(
            z.discriminatedUnion('type', [
              z.object({ type: z.literal('text'), name: z.string().min(1), value: z.string() }),
              z.object({ type: z.literal('file'), name: z.string().min(1), file: fileReference }),
            ]),
          ),
        }),
      ])
      .optional(),
    responseType: z.enum(['json', 'text', 'binary']).default('json'),
    fileName: z.string().min(1).default('output.bin'),
    failsafe: z.boolean().default(false),
    timeoutSeconds: z.number().min(0.001).max(3600).default(30),
  })
  .refine((input) => !['GET', 'HEAD'].includes(input.method) || input.body === undefined, {
    path: ['body'],
    message: 'GET and HEAD requests cannot have a body.',
  });

const outputSchema = z.object({
  status: z.number().int(),
  headers: z.record(z.string(), z.string()),
  body: z.union([z.json(), savedFile]),
});

function dropboxUrl(path: string): URL {
  let decodedPath: string;

  try {
    decodedPath = decodeURIComponent(path);
  } catch {
    throw new Error('[frogbot] Custom API calls require a Dropbox API URL.');
  }

  if (
    path.trim() !== path ||
    path.includes('\\') ||
    path.startsWith('//') ||
    /(^|\/)\.\.(\/|$)/.test(decodedPath)
  ) {
    throw new Error('[frogbot] Custom API calls require a Dropbox API URL.');
  }

  const url = new URL(path.startsWith('/') ? path.slice(1) : path, 'https://api.dropboxapi.com/2/');

  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'api.dropboxapi.com' ||
    url.port ||
    url.username ||
    url.password ||
    url.hash ||
    !url.pathname.startsWith('/2/')
  ) {
    throw new Error('[frogbot] Custom API calls require a Dropbox API URL.');
  }

  return url;
}

export const customApiCall = {
  slug: 'customApiCall',
  description: 'Call a Dropbox RPC API endpoint. Redirects and credential overrides are denied.',
  input: inputSchema,
  output: outputSchema,
  idempotent: false,
  async run({ client, input, req }: DropboxRunArgs<typeof inputSchema>) {
    const url = dropboxUrl(input.path);

    for (const [name, value] of Object.entries(input.query)) {
      url.searchParams.set(name, String(value));
    }

    const headers = new Headers(input.headers);

    for (const name of ['authorization', 'proxy-authorization', 'cookie', 'host']) {
      if (headers.has(name)) throw new Error(`[frogbot] Custom API header '${name}' is reserved.`);
    }

    let body: BodyInit | undefined;

    if (input.body?.type === 'json') {
      headers.set('content-type', 'application/json');
      body = JSON.stringify(input.body.value);
    } else if (input.body?.type === 'raw') {
      body = input.body.value;
    } else if (input.body?.type === 'formData') {
      const form = new FormData();

      for (const field of input.body.fields) {
        if (field.type === 'text') {
          form.append(field.name, field.value);
        } else {
          const data = await loadFile({ req, file: field.file });

          form.append(field.name, new Blob([new Uint8Array(data)]), field.file.name ?? 'file');
        }
      }

      headers.delete('content-type');
      body = form;
    }

    const response = await client.request(url.href, {
      method: input.method,
      headers,
      body,
      signal: requestSignal(req),
      timeout: Math.ceil(input.timeoutSeconds * 1000),
      failsafe: input.failsafe,
    });
    const responseBody =
      input.responseType === 'binary'
        ? await saveFile({
            req,
            data: responseBytes(response.body),
            name: input.fileName,
            mimeType: response.headers['content-type']?.split(';')[0] ?? 'application/octet-stream',
          })
        : input.responseType === 'text'
          ? new TextDecoder().decode(responseBytes(response.body))
          : response.body;

    return outputSchema.parse({ ...response, body: responseBody });
  },
};
