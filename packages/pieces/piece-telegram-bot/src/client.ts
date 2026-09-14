import { createHmac, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

import { telegramBotAuth } from './config.js';

const telegramResponse = z
  .object({
    ok: z.boolean(),
    result: z.unknown().optional(),
    error_code: z.number().optional(),
    description: z.string().optional(),
    parameters: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export type TelegramResponse = z.output<typeof telegramResponse>;

export type TelegramRequest = {
  method?: string;
  headers?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: unknown;
};

function queryString(query: Record<string, unknown> | undefined) {
  const params = new URLSearchParams();

  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null) params.set(key, String(value));
  });

  const value = params.toString();

  return value ? `?${value}` : '';
}

export function createTelegramBotClient({ auth: value }: { auth: unknown }) {
  const auth = telegramBotAuth.parse(value);
  const baseUrl = `https://api.telegram.org/bot${auth.botToken}`;
  const webhookSecret = createHmac('sha256', auth.botToken)
    .update('frogbot-telegram-webhook')
    .digest('hex');

  return {
    fileUrl(path: string) {
      return `https://api.telegram.org/file/bot${auth.botToken}/${path.replace(/^\/+/, '')}`;
    },
    async call(method: string, body?: unknown): Promise<TelegramResponse> {
      const multipart = body instanceof FormData;
      const response = await fetch(`${baseUrl}/${method}`, {
        method: 'POST',
        headers: multipart ? undefined : { 'Content-Type': 'application/json' },
        body: multipart ? body : JSON.stringify(body ?? {}),
      });
      const result = telegramResponse.parse(await response.json());

      if (!response.ok || !result.ok) {
        throw new Error(
          `Telegram API ${method} failed${result.error_code ? ` (${result.error_code})` : ''}: ${result.description ?? response.statusText}`,
        );
      }

      return result;
    },
    webhookSecret,
    verifyWebhookSecret(value: string | null) {
      if (!value || value.length !== webhookSecret.length) return false;

      return timingSafeEqual(Buffer.from(value), Buffer.from(webhookSecret));
    },
    async request(endpoint: string, request: TelegramRequest): Promise<unknown> {
      const path = endpoint.replace(/^\/+/, '');
      const response = await fetch(`${baseUrl}/${path}${queryString(request.query)}`, {
        method: request.method ?? 'GET',
        headers:
          request.body === undefined
            ? request.headers
            : { 'Content-Type': 'application/json', ...request.headers },
        body: request.body === undefined ? undefined : JSON.stringify(request.body),
      });
      const result = telegramResponse.parse(await response.json());

      if (!response.ok || (typeof result.ok === 'boolean' && !result.ok)) {
        throw new Error(
          `Telegram API ${path} failed${result.error_code ? ` (${result.error_code})` : ''}: ${result.description ?? response.statusText}`,
        );
      }

      return result;
    },
    async downloadFile(path: string) {
      const response = await fetch(this.fileUrl(path));

      if (!response.ok) {
        throw new Error(
          `Telegram file download failed (${response.status}): ${response.statusText}`,
        );
      }

      return Buffer.from(await response.arrayBuffer()).toString('base64');
    },
  };
}

export type TelegramBotClient = ReturnType<typeof createTelegramBotClient>;
