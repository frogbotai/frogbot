import type { PieceJSON } from 'frogbot/pieces';
import { z } from 'zod';

import type { ResendAction } from './types.js';

const input = z.object({
  method: z.string(),
  url: z.string(),
  headers: z.record(z.string(), z.string()).optional(),
  queryParams: z.record(z.string(), z.unknown()).optional(),
  body_type: z.enum(['none', 'json', 'form_data', 'raw']).optional(),
  body: z.unknown().optional(),
  response_is_binary: z.boolean().optional(),
  failsafe: z.boolean().optional(),
  timeout: z.number().optional(),
  followRedirects: z.boolean().optional(),
});

export const customApiCall = {
  slug: 'customApiCall',
  description: 'Make a custom Resend API call',
  input,
  async run({ input, client, req }) {
    const timeout =
      input.timeout !== undefined
        ? AbortSignal.timeout(Math.max(0, input.timeout * 1000))
        : undefined;
    let bodyValue: unknown =
      input.body && typeof input.body === 'object' && 'data' in input.body
        ? (input.body as { data: PieceJSON }).data
        : input.body;
    let rawBody = input.body_type === 'raw';
    if (input.body_type === 'form_data' && Array.isArray(bodyValue)) {
      const form = new FormData();
      for (const field of bodyValue as Array<Record<string, unknown>>) {
        if (field.fieldType === 'file') {
          const file = field.fileFieldValue as
            { data?: ArrayBuffer | Blob | Uint8Array; filename?: string } | undefined;
          if (file?.data) {
            const value = file.data instanceof Blob ? file.data : new Blob([file.data]);
            form.append(String(field.fieldName), value, file.filename);
          }
        } else if (field.textFieldValue !== undefined) {
          form.append(String(field.fieldName), String(field.textFieldValue));
        }
      }
      bodyValue = form;
      rawBody = true;
    }
    const result = await client.request({
      allowFailure: input.failsafe === true,
      binary: input.response_is_binary,
      method: input.method,
      path: input.url.replace(/^https:\/\/api\.resend\.com/, ''),
      headers: input.headers,
      body: bodyValue,
      query: input.queryParams,
      rawBody,
      redirect: input.followRedirects === false ? 'manual' : 'follow',
      response: true,
      signal: timeout,
    });
    if (!input.response_is_binary) return result;
    const response = result as {
      body: Uint8Array;
      headers: Record<string, string>;
      status: number;
    };
    const collection = req.frogbot.config.files?.slug;
    if (!collection) {
      throw new Error(
        '[frogbot] Piece file output requires the files collection to be configured.',
      );
    }
    const contentType = response.headers['content-type'] ?? 'application/octet-stream';
    const extension = contentType.split('/')[1]?.split(';')[0] || 'bin';
    const doc = await req.frogbot.create({
      collection,
      data: {},
      file: {
        data: Buffer.from(response.body),
        mimetype: contentType,
        name: `output.${extension}`,
        size: response.body.byteLength,
      },
      overrideAccess: true,
    });
    const url = (doc as Record<string, unknown>).url;
    if (typeof url !== 'string' || !url) {
      throw new Error(`[frogbot] Upload collection '${collection}' did not return a file URL.`);
    }
    return { ...response, body: url };
  },
} satisfies ResendAction;
