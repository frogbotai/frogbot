import { z } from 'zod';

import { defineAction, defineCustomApiCall } from './define.js';
import { savedFile, saveFile } from './files.js';
import { requestOptions, sheetInput } from './shared.js';

const exportInput = sheetInput.extend({
  format: z.enum(['csv', 'tsv']).default('csv'),
  returnAsText: z.boolean().default(false),
});

export const exportWorksheet = defineAction({
  slug: 'exportWorksheet',
  description: 'Export the selected worksheet as formatted CSV or TSV text or a saved file.',
  input: exportInput,
  output: z.union([
    z.object({ text: z.string(), format: z.enum(['csv', 'tsv']) }),
    z.object({ file: savedFile, format: z.enum(['csv', 'tsv']) }),
  ]),
  idempotent: true,
  async run({ client, req, input }) {
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
});

export const customApiCall = defineCustomApiCall({
  name: 'Google Sheets',
  description:
    'Call a Sheets v4 endpoint under /spreadsheets with the connected credential. Returns { status, headers, body }.',
  baseUrl: 'https://sheets.googleapis.com/v4',
  path: /^\/spreadsheets(?:[/:]|$)/,
  reservedHeaders: ['x-goog-api-key'],
  authorize: async ({ client, url, headers }) => {
    (await client.auth.getRequestHeaders(url)).forEach((value, key) => headers.set(key, value));
  },
});
