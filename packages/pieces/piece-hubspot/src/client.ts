import type { FrogBotRequest } from 'frogbot/pieces';
import { z } from 'zod';

import { hubspotAuth } from './config.js';

type Query = Record<string, string | number | boolean | readonly string[] | undefined>;

export type HubSpotRequest = {
  method?: string;
  /** A path under the API root, such as `/crm/v3/owners`. */
  path: string;
  query?: Query;
  /** Sent as JSON. */
  body?: unknown;
  signal?: AbortSignal;
};

export type HubSpotClient = ReturnType<typeof createHubSpotClient>;

export const hubspotApi = 'https://api.hubapi.com';

const maxRetries = 3;
const defaultRetrySeconds = 10;

const hubspotErrorBody = z.object({
  message: z.string().optional(),
  category: z.string().optional(),
});

export class HubSpotError extends Error {
  readonly status: number;
  /** HubSpot's error category, such as `VALIDATION_ERROR` or `RATE_LIMITS`. */
  readonly category: string | undefined;
  readonly body: unknown;

  constructor(status: number, message: string, category: string | undefined, body: unknown) {
    super(message);
    this.name = 'HubSpotError';
    this.status = status;
    this.category = category;
    this.body = body;
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function failure(response: Response) {
  const text = await response.text().catch(() => '');
  const body = parseJson(text);
  const parsed = hubspotErrorBody.safeParse(body);
  const category = parsed.success ? parsed.data.category : undefined;
  const detail = parsed.success && parsed.data.message ? parsed.data.message : text.slice(0, 500);
  const status = category ? `${response.status} ${category}` : String(response.status);

  return new HubSpotError(
    response.status,
    `HubSpot request failed (${status})${detail ? `: ${detail}` : ''}`,
    category,
    body,
  );
}

function retryDelay(header: string | null) {
  const seconds = header === null ? defaultRetrySeconds : Number(header);

  return Number.isFinite(seconds)
    ? Math.min(Math.max(seconds, 0), 120) * 1000
    : defaultRetrySeconds * 1000;
}

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal?.throwIfAborted();

    const abort = () => {
      clearTimeout(timer);
      reject(signal?.reason instanceof Error ? signal.reason : new Error('Aborted.'));
    };

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, ms);

    signal?.addEventListener('abort', abort, { once: true });
  });
}

export function createHubSpotClient({ auth }: { auth: unknown }) {
  const authorization = `Bearer ${hubspotAuth.parse(auth).accessToken}`;

  function url(request: HubSpotRequest) {
    const path = request.path.startsWith('/') ? request.path : `/${request.path}`;
    const target = new URL(`${hubspotApi}${path}`);

    for (const [name, value] of Object.entries(request.query ?? {})) {
      if (value === undefined || (Array.isArray(value) && value.length === 0)) continue;

      target.searchParams.set(name, Array.isArray(value) ? value.join(',') : String(value));
    }

    return target;
  }

  async function json(request: HubSpotRequest): Promise<unknown> {
    const target = url(request);

    for (let attempt = 0; ; attempt++) {
      const result = await fetch(target, {
        method: request.method ?? 'GET',
        headers: {
          authorization,
          accept: 'application/json',
          ...(request.body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: request.body === undefined ? undefined : JSON.stringify(request.body),
        redirect: 'error',
        signal: request.signal,
      });

      if (result.ok) {
        const text = result.status === 204 ? '' : await result.text();

        return text ? JSON.parse(text) : undefined;
      }

      if (result.status === 429 && attempt < maxRetries) {
        await result.body?.cancel();
        await wait(retryDelay(result.headers.get('retry-after')), request.signal);
        continue;
      }

      throw await failure(result);
    }
  }

  async function request<T>(schema: z.ZodType<T>, options: HubSpotRequest): Promise<T> {
    return schema.parse(await json(options));
  }

  return {
    json,
    request,
    authorize(headers: Headers) {
      headers.set('authorization', authorization);
    },
  };
}

export function signal(req: FrogBotRequest) {
  req.signal?.throwIfAborted();

  return req.signal ?? undefined;
}
