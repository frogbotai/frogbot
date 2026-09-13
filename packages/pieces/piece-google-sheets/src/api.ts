import { z } from 'zod';

import { fileReference, loadFile, savedFile, saveFile } from './files.js';
import { requestOptions, sheetInput, type SheetsArgs } from './shared.js';

const exportInput = sheetInput.extend({
  format: z.enum(['csv', 'tsv']).default('csv'),
  returnAsText: z.boolean().default(false),
});
export const exportWorksheet = {
  slug: 'exportWorksheet' as const,
  description: 'Export the selected worksheet as formatted CSV or TSV text or a saved file.',
  input: exportInput,
  output: z.union([
    z.object({ text: z.string(), format: z.enum(['csv', 'tsv']) }),
    z.object({ file: savedFile, format: z.enum(['csv', 'tsv']) }),
  ]),
  idempotent: true,
  async run({ client, req, input }: SheetsArgs<z.output<typeof exportInput>>) {
    let url = new URL(
      `https://docs.google.com/spreadsheets/d/${encodeURIComponent(input.spreadsheetId)}/export`,
    );
    url.search = new URLSearchParams({
      format: input.format,
      id: input.spreadsheetId,
      gid: String(input.sheetId),
    }).toString();
    for (let redirects = 0; redirects <= 5; redirects++) {
      const options = {
        ...requestOptions(req),
        url: url.toString(),
        method: 'GET' as const,
        responseType: 'arraybuffer' as const,
        redirect: 'manual' as const,
        validateStatus: (status: number) => status >= 200 && status < 400,
      };
      const response =
        url.origin === 'https://docs.google.com'
          ? await client.auth.request<ArrayBuffer>(options)
          : await client.auth.transporter.request<ArrayBuffer>(options);
      if (response.status >= 300) {
        const location = response.headers.get('location');
        if (!location) throw new Error('Worksheet export redirect is missing its destination.');
        url = new URL(location, url);
        if (
          url.protocol !== 'https:' ||
          url.port ||
          url.username ||
          url.password ||
          !(url.hostname === 'docs.google.com' || url.hostname.endsWith('.googleusercontent.com'))
        ) {
          throw new Error('Worksheet export redirected outside Google.');
        }
        continue;
      }
      const data = Buffer.from(response.data);
      if (input.returnAsText) return { text: data.toString('utf8'), format: input.format };
      const name = `exported_sheet.${input.format}`;
      return {
        file: await saveFile({
          req,
          data,
          name,
          mimeType: input.format === 'csv' ? 'text/csv' : 'text/tab-separated-values',
        }),
        format: input.format,
      };
    }
    throw new Error('Worksheet export exceeded the redirect limit.');
  },
};

const customInput = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']).default('GET'),
  path: z.string().startsWith('/'),
  query: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z
    .union([
      z.object({ type: z.literal('json'), value: z.json() }),
      z.object({ type: z.literal('raw'), value: z.string() }),
      z.object({
        type: z.literal('form'),
        fields: z.array(
          z.union([
            z.object({ name: z.string(), value: z.string() }),
            z.object({ name: z.string(), file: fileReference }),
          ]),
        ),
      }),
    ])
    .optional(),
  binary: z.boolean().default(false),
  filename: z.string().min(1).default('response.bin'),
  failOnError: z.boolean().default(true),
  timeoutMs: z.number().int().positive().max(300_000).default(30_000),
});
export const customApiCall = {
  slug: 'customApiCall' as const,
  description: 'Call a Sheets v4 endpoint under /spreadsheets with redirects disabled.',
  input: customInput,
  output: z.object({
    status: z.number().int(),
    headers: z.record(z.string(), z.string()),
    body: z.json().optional(),
    file: savedFile.optional(),
  }),
  idempotent: false,
  async run({ client, req, input }: SheetsArgs<z.output<typeof customInput>>) {
    const url = new URL(`https://sheets.googleapis.com/v4${input.path}`);
    if (
      /[\\\r\n]/.test(input.path) ||
      url.origin !== 'https://sheets.googleapis.com' ||
      !/^\/v4\/spreadsheets(?:\/|$|:)/.test(url.pathname) ||
      url.hash ||
      url.username ||
      url.password
    ) {
      throw new Error('Custom API paths must remain inside the Google Sheets v4 spreadsheets API.');
    }
    const headers = new Headers(input.headers);
    for (const name of headers.keys()) {
      if (
        ['authorization', 'cookie', 'host', 'proxy-authorization', 'x-goog-api-key'].includes(name)
      ) {
        throw new Error(`Custom header '${name}' is reserved.`);
      }
    }
    let data: string | number | boolean | object | undefined;
    if (input.body?.type === 'form') {
      const form = new FormData();
      for (const field of input.body.fields) {
        if ('value' in field) form.append(field.name, field.value);
        else {
          const file = await loadFile({ req, file: field.file });
          form.append(field.name, file.blob, file.name);
        }
      }
      data = form;
    } else if (input.body) {
      data = input.body.value === null ? 'null' : input.body.value;
      if (input.body.type === 'json' && !headers.has('content-type')) {
        headers.set('content-type', 'application/json');
      }
    }
    const response = await client.auth.request({
      ...requestOptions(req),
      url: url.toString(),
      method: input.method,
      params: input.query,
      headers,
      data,
      timeout: input.timeoutMs,
      responseType: input.binary ? 'arraybuffer' : 'json',
      validateStatus: (status) =>
        input.failOnError ? status >= 200 && status < 300 : status < 300 || status >= 400,
    });
    const result = {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
    };
    if (input.binary) {
      return {
        ...result,
        file: await saveFile({
          req,
          data: Buffer.from(response.data as ArrayBuffer),
          name: input.filename,
          mimeType: response.headers.get('content-type') ?? 'application/octet-stream',
        }),
      };
    }
    return {
      ...result,
      body: response.data == null || response.data === '' ? null : z.json().parse(response.data),
    };
  },
};
