import type { FrogBotRequest } from 'frogbot/pieces';
import { z } from 'zod';

import { salesforceAuth } from './config.js';

type Query = Record<string, string | number | boolean | undefined>;

export type SalesforceRequest = {
  method?: string;
  /** A path under `/services/data/`, such as `/services/data/v68.0/sobjects`. */
  path: string;
  query?: Query;
  /** Sent as JSON. */
  body?: unknown;
  /** Sent as `text/csv`, for Bulk API uploads. */
  csv?: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

export type SalesforceClient = ReturnType<typeof createSalesforceClient>;

const errorItem = z.object({
  errorCode: z.string().optional(),
  message: z.string().optional(),
  fields: z.array(z.string()).optional(),
});

const errorBody = z.union([
  z.array(errorItem).transform((items) => items[0]),
  z
    .object({ error: z.string(), error_description: z.string().optional() })
    .transform(({ error, error_description }) => ({
      errorCode: error,
      message: error_description,
    })),
]);

export class SalesforceError extends Error {
  readonly status: number;
  /** Salesforce's error code, such as `INVALID_FIELD` or `REQUEST_LIMIT_EXCEEDED`. */
  readonly errorCode: string | undefined;
  readonly body: unknown;

  constructor(status: number, message: string, errorCode: string | undefined, body: unknown) {
    super(message);
    this.name = 'SalesforceError';
    this.status = status;
    this.errorCode = errorCode;
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
  const parsed = errorBody.safeParse(body);
  const errorCode = parsed.success ? parsed.data?.errorCode : undefined;
  const detail = parsed.success && parsed.data?.message ? parsed.data.message : text.slice(0, 500);
  const status = errorCode ? `${response.status} ${errorCode}` : String(response.status);

  return new SalesforceError(
    response.status,
    `Salesforce request failed (${status})${detail ? `: ${detail}` : ''}`,
    errorCode,
    body,
  );
}

/** Refuses any path outside the REST API, so the token only ever goes to `/services/data/`. */
export function assertDataPath(path: string) {
  const [pathname = ''] = path.split('?');

  if (
    !pathname.startsWith('/services/data/') ||
    /[\s\\#\p{Cc}]/u.test(path) ||
    pathname.includes('//') ||
    pathname.split('/').some((segment) => /^(?:\.|%2e){1,2}$/i.test(segment))
  ) {
    throw new Error(`Salesforce path '${path}' must stay under /services/data/.`);
  }
}

function identityHosts(instanceUrl: string, loginHost: string | undefined) {
  return new Set(
    [
      new URL(instanceUrl).hostname,
      loginHost,
      'login.salesforce.com',
      'test.salesforce.com',
    ].filter((host): host is string => !!host),
  );
}

const identity = z.object({
  user_id: z.string(),
  organization_id: z.string(),
  username: z.string().optional(),
  display_name: z.string().optional(),
  email: z.string().optional(),
});

export function createSalesforceClient({ auth }: { auth: unknown }, loginHost?: string) {
  const credential = salesforceAuth.parse(auth);
  const authorization = `Bearer ${credential.accessToken}`;
  const instanceUrl = new URL(credential.instanceUrl).origin;

  function url(request: SalesforceRequest) {
    assertDataPath(request.path);

    const target = new URL(request.path, instanceUrl);

    if (target.origin !== instanceUrl || !target.pathname.startsWith('/services/data/')) {
      throw new Error(`Salesforce path '${request.path}' must stay under /services/data/.`);
    }

    for (const [name, value] of Object.entries(request.query ?? {})) {
      if (value !== undefined) target.searchParams.set(name, String(value));
    }

    return target;
  }

  async function send(request: SalesforceRequest): Promise<Response> {
    const target = url(request);
    const response = await fetch(target, {
      method: request.method ?? 'GET',
      headers: {
        authorization,
        accept: 'application/json',
        ...(request.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(request.csv !== undefined ? { 'content-type': 'text/csv' } : {}),
        ...request.headers,
      },
      body: request.csv ?? (request.body === undefined ? undefined : JSON.stringify(request.body)),
      redirect: 'error',
      signal: request.signal,
    });

    if (!response.ok && response.status !== 304) throw await failure(response);

    return response;
  }

  async function json(request: SalesforceRequest): Promise<unknown> {
    const response = await send(request);
    const text = response.status === 204 || response.status === 304 ? '' : await response.text();

    return text ? JSON.parse(text) : undefined;
  }

  async function request<T>(schema: z.ZodType<T>, options: SalesforceRequest): Promise<T> {
    return schema.parse(await json(options));
  }

  const ids = credential.identityUrl?.match(/\/id\/([A-Za-z0-9]{15,18})\/([A-Za-z0-9]{15,18})$/);

  return {
    instanceUrl,
    orgId: ids?.[1],
    send,
    json,
    request,
    authorize(headers: Headers) {
      headers.set('authorization', authorization);
    },
    async identity(signal?: AbortSignal) {
      if (!credential.identityUrl) throw new Error('Salesforce connection has no identity URL.');

      const target = new URL(credential.identityUrl);

      if (!identityHosts(instanceUrl, loginHost).has(target.hostname)) {
        throw new Error('Salesforce identity URL is not on the login or instance host.');
      }

      const response = await fetch(target, {
        headers: { authorization, accept: 'application/json' },
        redirect: 'error',
        signal,
      });

      if (!response.ok) throw await failure(response);

      return identity.parse(await response.json());
    },
  };
}

export function signal(req: FrogBotRequest) {
  req.signal?.throwIfAborted();

  return req.signal ?? undefined;
}
