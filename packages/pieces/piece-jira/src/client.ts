import type { FrogBotRequest } from 'frogbot/pieces';
import { z } from 'zod';

import { jiraAuth, type JiraOptions } from './config.js';

type Query = Record<string, string | number | boolean | readonly string[] | undefined>;

export type JiraRequest = {
  method?: string;
  /** A path under the API root, such as `/issue/OPS-12`. */
  path: string;
  api?: 'platform' | 'agile';
  query?: Query;
  /** JSON, or `FormData` sent as multipart. */
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

export type JiraClient = Awaited<ReturnType<typeof createJiraClient>>;

const accessibleResourcesUrl = 'https://api.atlassian.com/oauth/token/accessible-resources';
const apiRoots = { platform: '/rest/api/3', agile: '/rest/agile/1.0' } as const;
const maxRetries = 3;

const jiraErrorBody = z.object({
  errorMessages: z.array(z.string()).optional(),
  errors: z.record(z.string(), z.string()).optional(),
  message: z.string().optional(),
});

const accessibleResources = z.array(
  z.object({ id: z.string(), url: z.string(), name: z.string() }),
);

export class JiraError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'JiraError';
    this.status = status;
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
  const parsed = jiraErrorBody.safeParse(parseJson(text));
  const detail = parsed.success
    ? [
        ...(parsed.data.errorMessages ?? []),
        ...Object.entries(parsed.data.errors ?? {}).map(
          ([field, message]) => `${field}: ${message}`,
        ),
        ...(parsed.data.message ? [parsed.data.message] : []),
      ].join('; ')
    : text.slice(0, 500);

  return new JiraError(
    response.status,
    `Jira request failed (${response.status})${detail ? `: ${detail}` : ''}`,
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

async function cloudSite(accessToken: string, siteUrl: string | undefined) {
  const response = await fetch(accessibleResourcesUrl, {
    headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
    redirect: 'error',
  });

  if (!response.ok) throw await failure(response);

  const sites = accessibleResources.parse(await response.json());
  const site = siteUrl
    ? sites.find((entry) => URL.canParse(entry.url) && new URL(entry.url).origin === siteUrl)
    : sites.length === 1
      ? sites[0]
      : undefined;

  if (site) return site;

  const urls = sites.map((entry) => entry.url).join(', ') || 'none';

  throw new Error(
    siteUrl
      ? `This Atlassian account cannot reach ${siteUrl}. Its sites: ${urls}.`
      : `This Atlassian account reaches several Jira sites; set the siteUrl option to one of: ${urls}.`,
  );
}

export async function createJiraClient({ auth, options }: { auth: unknown; options: JiraOptions }) {
  const credential = jiraAuth.parse(auth);
  let baseUrl: string;
  let authorization: string;

  if ('accessToken' in credential) {
    const site = await cloudSite(credential.accessToken, options.siteUrl);

    baseUrl = `https://api.atlassian.com/ex/jira/${encodeURIComponent(site.id)}`;
    authorization = `Bearer ${credential.accessToken}`;
  } else {
    if (!options.siteUrl) throw new Error('Jira needs the `siteUrl` option for API tokens.');

    baseUrl = options.siteUrl;
    authorization = `Basic ${Buffer.from(`${credential.email}:${credential.apiToken}`).toString('base64')}`;
  }

  const base = new URL(baseUrl);

  function url(request: JiraRequest) {
    const path = request.path.startsWith('/') ? request.path : `/${request.path}`;
    const target = new URL(`${baseUrl}${apiRoots[request.api ?? 'platform']}${path}`);

    for (const [name, value] of Object.entries(request.query ?? {})) {
      if (value === undefined) continue;

      target.searchParams.set(name, Array.isArray(value) ? value.join(',') : String(value));
    }

    return target;
  }

  async function response(request: JiraRequest) {
    const target = url(request);
    const multipart = request.body instanceof FormData;

    for (let attempt = 0; ; attempt++) {
      const result = await fetch(target, {
        method: request.method ?? 'GET',
        headers: {
          authorization,
          accept: 'application/json',
          ...(request.body === undefined || multipart
            ? {}
            : { 'content-type': 'application/json' }),
          ...request.headers,
        },
        body:
          request.body === undefined
            ? undefined
            : multipart
              ? (request.body as FormData)
              : JSON.stringify(request.body),
        redirect: 'error',
        signal: request.signal,
      });

      if (result.ok) return result;

      if (result.status === 429 && attempt < maxRetries) {
        await result.body?.cancel();
        await wait(retryDelay(result.headers.get('retry-after')), request.signal);
        continue;
      }

      throw await failure(result);
    }
  }

  async function request<T>(schema: z.ZodType<T>, args: JiraRequest): Promise<T> {
    const result = await response(args);
    const text = result.status === 204 ? '' : await result.text();

    return schema.parse(text ? JSON.parse(text) : undefined);
  }

  return {
    baseUrl,
    request,
    response,
    authorize(target: URL, headers: Headers) {
      if (
        target.origin !== base.origin ||
        target.username ||
        target.password ||
        !target.pathname.startsWith(`${base.pathname.replace(/\/$/, '')}/rest/`)
      ) {
        throw new Error('Jira URL must stay within the configured site.');
      }

      headers.set('authorization', authorization);
    },
  };
}

export function signal(req: FrogBotRequest) {
  req.signal?.throwIfAborted();

  return req.signal ?? undefined;
}
