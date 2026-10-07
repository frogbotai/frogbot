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

export class TelegramApiError extends Error {
  readonly code?: number;
  readonly description?: string;
  readonly retryAfter?: number;

  constructor({
    code,
    description,
    method,
    retryAfter,
  }: {
    code?: number;
    description?: string;
    method: string;
    retryAfter?: number;
  }) {
    super(`Telegram API ${method} failed${code ? ` (${code})` : ''}: ${description}`);

    this.name = 'TelegramApiError';
    this.code = code;
    this.description = description;
    this.retryAfter = retryAfter;
  }
}

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

function apiError({
  method,
  response,
  result,
}: {
  method: string;
  response: Response;
  result: TelegramResponse;
}): TelegramApiError {
  const retryAfter = result.parameters?.retry_after;

  return new TelegramApiError({
    method,
    code: result.error_code,
    description: result.description ?? response.statusText,
    ...(typeof retryAfter === 'number' ? { retryAfter } : {}),
  });
}

export function createTelegramBotClient({ auth: value }: { auth: unknown }) {
  const auth = telegramBotAuth.parse(value);
  const apiUrl = (process.env.TELEGRAM_API_BASE_URL ?? 'https://api.telegram.org').replace(
    /\/+$/,
    '',
  );

  const baseUrl = `${apiUrl}/bot${auth.botToken}`;

  return {
    fileUrl(path: string) {
      return `${apiUrl}/file/bot${auth.botToken}/${path.replace(/^\/+/, '')}`;
    },
    async call(method: string, body?: unknown): Promise<TelegramResponse> {
      const multipart = body instanceof FormData;
      const response = await fetch(`${baseUrl}/${method}`, {
        method: 'POST',
        headers: multipart ? undefined : { 'Content-Type': 'application/json' },
        body: multipart ? body : JSON.stringify(body ?? {}),
      });

      const result = telegramResponse.parse(await response.json());

      if (!response.ok || !result.ok) throw apiError({ method, response, result });

      return result;
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
        throw apiError({ method: path, response, result });
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
