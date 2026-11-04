import type { FrogBotRequest } from 'frogbot/pieces';
import { z } from 'zod';

import { asanaAuth } from './config.js';

type Query = Record<string, string | number | boolean | readonly string[] | undefined>;

export type AsanaRequest = {
  method?: string;
  /** A path under the API root, such as `/tasks/1203`. */
  path: string;
  query?: Query;
  /** Sent as Asana's `{ data }` envelope. */
  body?: unknown;
  signal?: AbortSignal;
};

export type AsanaClient = ReturnType<typeof createAsanaClient>;

export const asanaApi = 'https://app.asana.com/api/1.0';

const maxRetries = 3;

const asanaErrorBody = z.object({
  errors: z.array(z.object({ message: z.string().optional() })).optional(),
});

export class AsanaError extends Error {
  readonly status: number;
  /** The parsed response body, such as the fresh `sync` token on an Events API 412. */
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = 'AsanaError';
    this.status = status;
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
  const parsed = asanaErrorBody.safeParse(body);
  const detail = parsed.success
    ? (parsed.data.errors ?? [])
        .map((error) => error.message)
        .filter(Boolean)
        .join('; ')
    : text.slice(0, 500);

  return new AsanaError(
    response.status,
    `Asana request failed (${response.status})${detail ? `: ${detail}` : ''}`,
    body,
  );
}

function retryDelay(header: string | null) {
  const seconds = Number(header ?? 1);

  return Number.isFinite(seconds) ? Math.min(Math.max(seconds, 0), 120) * 1000 : 1000;
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

export function createAsanaClient({ auth }: { auth: unknown }) {
  const authorization = `Bearer ${asanaAuth.parse(auth).accessToken}`;

  function url(request: AsanaRequest) {
    const path = request.path.startsWith('/') ? request.path : `/${request.path}`;
    const target = new URL(`${asanaApi}${path}`);

    for (const [name, value] of Object.entries(request.query ?? {})) {
      if (value === undefined) continue;

      target.searchParams.set(name, Array.isArray(value) ? value.join(',') : String(value));
    }

    return target;
  }

  async function json(request: AsanaRequest): Promise<unknown> {
    const target = url(request);

    for (let attempt = 0; ; attempt++) {
      const result = await fetch(target, {
        method: request.method ?? 'GET',
        headers: {
          authorization,
          accept: 'application/json',
          ...(request.body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: request.body === undefined ? undefined : JSON.stringify({ data: request.body }),
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

  async function data<T>(schema: z.ZodType<T>, request: AsanaRequest): Promise<T> {
    return z.object({ data: schema }).parse(await json(request)).data;
  }

  return {
    json,
    data,
    authorize(headers: Headers) {
      headers.set('authorization', authorization);
    },
  };
}

export function signal(req: FrogBotRequest) {
  req.signal?.throwIfAborted();

  return req.signal ?? undefined;
}
