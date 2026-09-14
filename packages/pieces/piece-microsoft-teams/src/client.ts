import type { FrogbotRequest } from 'frogbot';
import { z } from 'zod';

import { microsoftTeamsAuth, microsoftTeamsClouds } from './config.js';
import { type GraphPage, page } from './schemas.js';

type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string | number>;
  signal?: AbortSignal;
};

export type MicrosoftTeamsClient = ReturnType<typeof createMicrosoftTeamsClient>;

export function createMicrosoftTeamsClient({ auth }: { auth: unknown }) {
  const credential = microsoftTeamsAuth.parse(auth);
  const environment = Object.values(microsoftTeamsClouds).find(
    (value) => value.loginHost === credential.cloud,
  );

  if (!environment) throw new Error('Microsoft Teams cloud environment is unsupported.');

  const baseUrl = environment.graphUrl;

  function url(path: string, query?: RequestOptions['query']) {
    const target = new URL(path, `${baseUrl}/v1.0/`);

    if (target.origin !== baseUrl || target.username || target.password) {
      throw new Error('Microsoft Graph URL must stay within the configured cloud.');
    }

    for (const [name, value] of Object.entries(query ?? {})) {
      target.searchParams.set(name, String(value));
    }

    return target;
  }

  async function raw(path: string, options: RequestOptions = {}) {
    const response = await fetch(url(path, options.query), {
      method: options.method ?? 'GET',
      headers: {
        authorization: `Bearer ${credential.accessToken}`,
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...options.headers,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      redirect: 'error',
      signal: options.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');

      throw new Error(
        `Microsoft Graph request failed (${response.status})${detail ? `: ${detail}` : ''}`,
      );
    }

    return response;
  }

  async function request<T>(
    path: string,
    schema: z.ZodType<T>,
    options?: RequestOptions,
  ): Promise<T> {
    const response = await raw(path, options);
    const value: unknown = response.status === 204 ? {} : await response.json();

    return schema.parse(value);
  }

  async function list<T>(path: string, schema: z.ZodType<T>, options?: RequestOptions) {
    const items: T[] = [];
    let next: string | undefined = path;

    while (next) {
      const result: GraphPage<T> = await request(
        next,
        page(schema),
        next === path ? options : undefined,
      );

      items.push(...result.value);
      next = result['@odata.nextLink'];
    }

    return items;
  }

  async function getPage<T>(
    path: string,
    schema: z.ZodType<T>,
    options?: RequestOptions,
  ): Promise<GraphPage<T>> {
    return request(path, page(schema), options);
  }

  async function meetingId(type: string, value: string, abortSignal?: AbortSignal) {
    if (type === 'meetingId') return value;

    const escaped = value.replaceAll("'", "''");
    const filter =
      type === 'joinWebUrl'
        ? `JoinWebUrl eq '${escaped}'`
        : `joinMeetingIdSettings/joinMeetingId eq '${escaped}'`;
    const meetings = await request('/v1.0/me/onlineMeetings', page(z.object({ id: z.string() })), {
      query: { $filter: filter },
      signal: abortSignal,
    });
    const meeting = meetings.value[0];

    if (!meeting) throw new Error('No meeting found with the provided identifier.');

    return meeting.id;
  }

  return {
    baseUrl,
    request,
    async text(path: string, options?: RequestOptions) {
      return (await raw(path, options)).text();
    },
    list,
    page: getPage,
    meetingId,
    async custom(path: string, schema: z.ZodType, options?: RequestOptions) {
      const response = await raw(path, options);
      const value: unknown = response.status === 204 ? null : await response.json();

      return { status: response.status, body: schema.parse(value) };
    },
  };
}

export function signal(req: FrogbotRequest) {
  req.signal?.throwIfAborted();

  return req.signal ?? undefined;
}
