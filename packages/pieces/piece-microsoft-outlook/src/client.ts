import { microsoftCloud } from '@frogbotai/piece-microsoft';
import type { FrogBotRequest } from 'frogbot/pieces';
import { z } from 'zod';

import { microsoftOutlookAuth } from './config.js';

type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string | number | undefined>;
  signal?: AbortSignal;
};

type AppToken = { accessToken: string; expiresAt: number };

/** App-only tokens by cloud, tenant and client id, shared by every client one factory builds. */
export type AppTokenCache = Map<string, Promise<AppToken>>;

export type MicrosoftOutlookClient = ReturnType<typeof createMicrosoftOutlookClient>;

const maxRetries = 3;
const refreshMargin = 5 * 60 * 1000;
const sharedTenants = new Set(['common', 'organizations', 'consumers']);

const graphError = z.object({
  error: z.object({ code: z.string().optional(), message: z.string().optional() }),
});

const tokenError = z.object({ error_description: z.string() });

const tokenResponse = z.object({ access_token: z.string().min(1), expires_in: z.coerce.number() });

export class MicrosoftGraphError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, code: string | undefined, message: string) {
    super(message);
    this.name = 'MicrosoftGraphError';
    this.status = status;
    this.code = code;
  }
}

export function graphPage<T extends z.ZodType>(item: T) {
  return z.object({ value: z.array(item), '@odata.nextLink': z.string().optional() });
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function retryDelay(header: string | null) {
  if (!header) return 1000;

  const seconds = Number(header);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();

  return Number.isFinite(ms) ? Math.min(Math.max(ms, 0), 120_000) : 1000;
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

async function failure(response: Response) {
  const text = await response.text().catch(() => '');
  const parsed = graphError.safeParse(parseJson(text));
  const code = parsed.data?.error.code;
  const detail = parsed.data?.error.message ?? text;

  return new MicrosoftGraphError(
    response.status,
    code,
    `Microsoft Graph request failed (${response.status}${code ? ` ${code}` : ''})${detail ? `: ${detail}` : ''}`,
  );
}

export function createMicrosoftOutlookClient(auth: unknown, tokens: AppTokenCache) {
  const credential = microsoftOutlookAuth.parse(auth);
  const cloud = microsoftCloud(credential.cloud);
  const baseUrl = cloud.graphUrl;
  const appOnly = !credential.accessToken;

  if (appOnly && (!credential.clientId || !credential.clientSecret || !credential.mailbox)) {
    throw new Error(
      'Microsoft Outlook needs a linked account, or clientId, clientSecret and mailbox for app-only access.',
    );
  }

  if (appOnly && sharedTenants.has(credential.tenantId.toLowerCase())) {
    throw new Error('Microsoft Outlook app-only access needs your directory tenant ID.');
  }

  const mailbox = appOnly ? `/users/${encodeURIComponent(credential.mailbox!)}` : '/me';
  const tokenKey = `${credential.cloud}|${credential.tenantId}|${credential.clientId}`;

  async function fetchAppToken(signal?: AbortSignal): Promise<AppToken> {
    const response = await fetch(
      `https://${cloud.loginHost}/${encodeURIComponent(credential.tenantId)}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: credential.clientId!,
          client_secret: credential.clientSecret!,
          scope: `${baseUrl}/.default`,
        }),
        redirect: 'error',
        signal,
      },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      const parsed = tokenError.safeParse(parseJson(detail));
      const description = parsed.success ? parsed.data.error_description : detail;

      throw new Error(
        `Microsoft app-only sign-in failed (${response.status})${description ? `: ${description}` : ''}`,
      );
    }

    const token = tokenResponse.parse(await response.json());

    return { accessToken: token.access_token, expiresAt: Date.now() + token.expires_in * 1000 };
  }

  async function accessToken(signal?: AbortSignal) {
    if (credential.accessToken) return credential.accessToken;

    const cached = await tokens.get(tokenKey)?.catch(() => undefined);

    if (cached && cached.expiresAt - refreshMargin > Date.now()) return cached.accessToken;

    const pending = fetchAppToken(signal);

    tokens.set(tokenKey, pending);

    pending.catch(() => {
      if (tokens.get(tokenKey) === pending) tokens.delete(tokenKey);
    });

    return (await pending).accessToken;
  }

  function assertGraphUrl(target: URL) {
    if (
      target.origin !== baseUrl ||
      target.username ||
      target.password ||
      !target.pathname.startsWith('/v1.0/')
    ) {
      throw new Error('Microsoft Graph URL must stay within the configured cloud.');
    }
  }

  function url(pathOrUrl: string, query?: RequestOptions['query']) {
    const target = /^[a-z][a-z\d+.-]*:/i.test(pathOrUrl)
      ? new URL(pathOrUrl)
      : new URL(`${baseUrl}/v1.0${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`);

    assertGraphUrl(target);

    for (const [name, value] of Object.entries(query ?? {})) {
      if (value !== undefined) target.searchParams.set(name, String(value));
    }

    return target;
  }

  async function raw(path: string, options: RequestOptions = {}) {
    const target = url(path, options.query);

    for (let attempt = 0; ; attempt++) {
      const response = await fetch(target, {
        method: options.method ?? 'GET',
        headers: {
          authorization: `Bearer ${await accessToken(options.signal)}`,
          ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
          ...options.headers,
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        redirect: 'error',
        signal: options.signal,
      });

      if (response.ok) return response;

      if ((response.status === 429 || response.status === 503) && attempt < maxRetries) {
        await response.body?.cancel();
        await wait(retryDelay(response.headers.get('retry-after')), options.signal);
        continue;
      }

      throw await failure(response);
    }
  }

  async function request<T>(
    path: string,
    schema: z.ZodType<T>,
    options?: RequestOptions,
  ): Promise<T> {
    const response = await raw(path, options);
    const text = response.status === 204 ? '' : await response.text();

    return schema.parse(text ? JSON.parse(text) : {});
  }

  async function page<T>(pathOrNextLink: string, item: z.ZodType<T>, options?: RequestOptions) {
    const result = await request(pathOrNextLink, graphPage(item), options);

    return { value: result.value, nextLink: result['@odata.nextLink'] ?? null };
  }

  async function list<T>(path: string, item: z.ZodType<T>, options?: RequestOptions) {
    const items: T[] = [];
    let next: string | null = path;

    while (next) {
      const result: { value: T[]; nextLink: string | null } = await page(
        next,
        item,
        next === path ? options : { signal: options?.signal },
      );

      items.push(...result.value);
      next = result.nextLink;
    }

    return items;
  }

  return {
    baseUrl,
    mailbox,
    request,
    page,
    list,
    async authorize(target: URL, headers: Headers, signal?: AbortSignal) {
      if (target.origin !== baseUrl || target.username || target.password) {
        throw new Error('Microsoft Graph URL must stay within the configured cloud.');
      }

      headers.set('authorization', `Bearer ${await accessToken(signal)}`);
    },
  };
}

export function signal(req: FrogBotRequest) {
  req.signal?.throwIfAborted();

  return req.signal ?? undefined;
}
