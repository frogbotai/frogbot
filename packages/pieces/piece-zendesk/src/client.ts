import type { FrogBotRequest } from 'frogbot/pieces';
import { z } from 'zod';

import { zendeskAuth } from './config.js';

type Query = Record<string, string | number | boolean | readonly string[] | undefined>;

export type ZendeskRequest = {
  method?: string;
  /** A path on the account, such as `/api/v2/tickets/1`. Another origin throws before sending. */
  path: string;
  query?: Query;
  /** JSON, or bytes sent with `contentType`. */
  body?: unknown;
  contentType?: string;
  /** `manual` returns a 3xx response instead of following it. */
  redirect?: 'manual';
  signal?: AbortSignal;
};

export type ZendeskClient = ReturnType<typeof createZendeskClient>;

const maxRetries = 3;
const defaultRetrySeconds = 10;

const detailsBody = z.record(
  z.string(),
  z.array(z.object({ description: z.string().optional() }).loose()).catch([]),
);

const zendeskErrorBody = z
  .object({
    error: z
      .union([
        z.string(),
        z.object({ title: z.string().optional(), message: z.string().optional() }),
      ])
      .optional(),
    description: z.string().optional(),
    details: detailsBody.optional().catch(undefined),
    errors: z
      .array(z.object({ title: z.string().optional(), detail: z.string().optional() }).loose())
      .optional()
      .catch(undefined),
  })
  .loose();

export class ZendeskError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = 'ZendeskError';
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

function errorText(body: unknown, text: string) {
  const parsed = zendeskErrorBody.safeParse(body);

  if (!parsed.success) return text.slice(0, 500);

  const { error, description, details, errors } = parsed.data;
  const parts = [
    typeof error === 'string' ? error : (error?.title ?? error?.message),
    description,
    ...Object.entries(details ?? {}).map(
      ([field, items]) =>
        `${field}: ${items
          .map((item) => item.description)
          .filter(Boolean)
          .join(', ')}`,
    ),
    ...(errors ?? []).map((item) => [item.title, item.detail].filter(Boolean).join(': ')),
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join('; ') : text.slice(0, 500);
}

async function failure(response: Response) {
  const text = await response.text().catch(() => '');
  const body = parseJson(text);
  const detail = errorText(body, text);

  return new ZendeskError(
    response.status,
    `Zendesk request failed (${response.status})${detail ? `: ${detail}` : ''}`,
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

function isBytes(body: unknown): body is ArrayBuffer | Uint8Array | Blob {
  return body instanceof ArrayBuffer || body instanceof Uint8Array || body instanceof Blob;
}

export function createZendeskClient({ auth }: { auth: unknown }) {
  const { subdomain, email, apiToken } = zendeskAuth.parse(auth);
  const origin = `https://${subdomain}.zendesk.com`;
  const authorization = `Basic ${Buffer.from(`${email}/token:${apiToken}`).toString('base64')}`;

  function url(request: ZendeskRequest) {
    const target = new URL(request.path, origin);

    if (target.origin !== origin) throw new Error(`Path must target ${origin}.`);

    for (const [name, value] of Object.entries(request.query ?? {})) {
      if (value === undefined) continue;

      target.searchParams.set(name, Array.isArray(value) ? value.join(',') : String(value));
    }

    return target;
  }

  async function send(request: ZendeskRequest): Promise<Response> {
    const target = url(request);
    const bytes = isBytes(request.body);
    const isJson = request.body !== undefined && !bytes;
    const contentType = bytes
      ? (request.contentType ?? 'application/binary')
      : isJson
        ? 'application/json'
        : undefined;

    for (let attempt = 0; ; attempt++) {
      const response = await fetch(target, {
        method: request.method ?? 'GET',
        headers: {
          authorization,
          accept: 'application/json',
          ...(contentType ? { 'content-type': contentType } : {}),
        },
        body: bytes
          ? (request.body as BodyInit)
          : isJson
            ? JSON.stringify(request.body)
            : undefined,
        redirect: request.redirect ?? 'error',
        signal: request.signal,
      });

      if (response.ok) return response;

      if (request.redirect === 'manual' && response.status >= 300 && response.status < 400) {
        return response;
      }

      if (response.status === 429 && attempt < maxRetries) {
        await response.body?.cancel();
        await wait(retryDelay(response.headers.get('retry-after')), request.signal);
        continue;
      }

      throw await failure(response);
    }
  }

  async function json(request: ZendeskRequest): Promise<unknown> {
    const response = await send(request);
    const text = response.status === 204 ? '' : await response.text();

    return text ? JSON.parse(text) : {};
  }

  async function data<T>(schema: z.ZodType<T>, request: ZendeskRequest): Promise<T> {
    return schema.parse(await json(request));
  }

  return {
    origin,
    send,
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
