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
  const { origin } = new URL(apiUrl);

  function botUrl(path: string) {
    const url = new URL(`${baseUrl}/${path}`);

    if (url.origin !== origin) {
      throw new Error(`[frogbot] Telegram request URL must stay on ${origin}.`);
    }

    return url.href;
  }

  const basePath = new URL(apiUrl).pathname.replace(/\/+$/, '');

  return {
    apiUrl,
    authorize(url: URL) {
      url.href = botUrl(`${url.pathname.slice(basePath.length + 1)}${url.search}`);
    },
    fileUrl(path: string) {
      return `${apiUrl}/file/bot${auth.botToken}/${path.replace(/^\/+/, '')}`;
    },
    async call(method: string, body?: unknown): Promise<TelegramResponse> {
      const multipart = body instanceof FormData;
      const response = await fetch(botUrl(method), {
        method: 'POST',
        headers: multipart ? undefined : { 'Content-Type': 'application/json' },
        body: multipart ? body : JSON.stringify(body ?? {}),
      });

      const result = telegramResponse.parse(await response.json());

      if (!response.ok || !result.ok) throw apiError({ method, response, result });

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
