import { z } from 'zod';

import { type DriveRunArgs, requestOptions } from '../client.js';
import { contentBytes, fileReference, loadFile, saveFile } from '../files.js';
import { savedFileOutput } from '../schemas.js';

const inputSchema = z
  .object({
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']),
    path: z.string().min(1),
    headers: z.record(z.string(), z.string()).optional(),
    query: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
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
    fileName: z.string().min(1).default('download'),
    failsafe: z.boolean().default(false),
    timeoutSeconds: z.number().min(0.001).max(3600).default(30),
  })
  .refine((input) => !['GET', 'HEAD'].includes(input.method) || input.body === undefined, {
    message: 'GET and HEAD requests cannot have a body.',
    path: ['body'],
  });

const outputSchema = z.object({
  status: z.number().int(),
  headers: z.record(z.string(), z.string()),
  body: z.union([z.json(), savedFileOutput]),
});

export type CustomApiCallInput = z.input<typeof inputSchema>;
export type CustomApiCallOutput = z.output<typeof outputSchema>;

function driveUrl(path: string): URL {
  if (path.trim() !== path || path.includes('\\') || path.startsWith('//')) {
    throw new Error('[frogbot] Custom API calls require a Google Drive API URL.');
  }
  const url = new URL(
    path.startsWith('/') && !path.startsWith('/drive/v3') && !path.startsWith('/upload/drive/v3')
      ? `https://www.googleapis.com/drive/v3${path}`
      : path,
    'https://www.googleapis.com/drive/v3/',
  );
  if (
    url.protocol !== 'https:' ||
    !['www.googleapis.com', 'drive.googleapis.com'].includes(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    url.hash ||
    !/^\/(?:upload\/)?drive\/v3(?:\/|$)/.test(url.pathname)
  ) {
    throw new Error('[frogbot] Custom API calls require a Google Drive API URL.');
  }
  return url;
}

export const customApiCall = {
  slug: 'customApiCall' as const,
  description:
    'Call the Google Drive API with JSON, raw, or multipart data. Redirects are denied; binary responses become FrogBot files.',
  input: inputSchema,
  output: outputSchema,
  idempotent: false,
  async run({
    client,
    input,
    req,
  }: DriveRunArgs<typeof inputSchema>): Promise<CustomApiCallOutput> {
    const url = driveUrl(input.path);
    const headers = new Headers(input.headers);
    for (const name of ['authorization', 'proxy-authorization', 'cookie', 'host']) {
      if (headers.has(name)) throw new Error(`[frogbot] Custom API header '${name}' is reserved.`);
    }
    const timeout = AbortSignal.timeout(Math.ceil(input.timeoutSeconds * 1000));
    const signal = req.signal ? AbortSignal.any([req.signal, timeout]) : timeout;
    signal.throwIfAborted();
    let data: string | FormData | undefined;
    if (input.body?.type === 'json') {
      headers.set('content-type', 'application/json');
      data = JSON.stringify(input.body.value);
    } else if (input.body?.type === 'raw') {
      data = input.body.value;
    } else if (input.body?.type === 'formData') {
      const form = new FormData();
      for (const field of input.body.fields) {
        if (field.type === 'text') form.append(field.name, field.value);
        else {
          const file = await loadFile({ req, file: field.file, signal });
          form.append(
            field.name,
            new Blob([new Uint8Array(file.data)], { type: file.mimeType }),
            file.name,
          );
        }
      }
      headers.delete('content-type');
      data = form;
    }
    signal.throwIfAborted();
    const auth = client.context._options.auth;
    if (!auth || typeof auth === 'string' || !('request' in auth)) {
      throw new Error('[frogbot] Google Drive client has no authenticated transport.');
    }
    const response = await auth.request<unknown>({
      ...requestOptions(req),
      url,
      method: input.method,
      headers,
      params: input.query,
      data,
      signal,
      timeout: Math.ceil(input.timeoutSeconds * 1000),
      responseType: input.responseType === 'binary' ? 'arraybuffer' : input.responseType,
      validateStatus: (status) =>
        (status >= 200 && status < 300) || (input.failsafe && status >= 400),
    });
    signal.throwIfAborted();
    const body =
      input.responseType === 'binary'
        ? await saveFile({
            req,
            data: contentBytes(response.data),
            name: input.fileName,
            mimeType:
              response.headers.get('content-type')?.split(';')[0] ?? 'application/octet-stream',
          })
        : response.data;
    return outputSchema.parse({
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body,
    });
  },
};
