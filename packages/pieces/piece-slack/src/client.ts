import { z } from 'zod';

import { slackAuth } from './config.js';

const apiOrigin = 'https://slack.com';
const apiBase = `${apiOrigin}/api/`;

export const slackValue = z.record(z.string(), z.unknown());
export const slackValues = z.array(slackValue);
export const slackResponse = z.object({ ok: z.literal(true) }).catchall(z.unknown());
export const slackApiResult = z.object({
  status: z.number().int(),
  headers: z.record(z.string(), z.string()),
  body: z.unknown(),
});

export type SlackClient = ReturnType<typeof createSlackClient>;
export type SlackToken = 'bot' | 'user';

function safeMethod(method: string) {
  return ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
}

function endpoint(path: string) {
  const url = new URL(path, apiBase);

  if (
    url.origin !== apiOrigin ||
    !url.pathname.startsWith('/api/') ||
    !/^[a-zA-Z][a-zA-Z0-9._-]*$/.test(url.pathname.slice(5)) ||
    url.username ||
    url.password
  ) {
    throw new Error('Slack API method must be a relative method name.');
  }

  return url;
}

async function parseResponse(response: Response) {
  const text = await response.text();

  if (!text) return undefined;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function createSlackClient({ auth }: { auth: unknown }) {
  const tokens = slackAuth.parse(auth);
  let resolvedWorkspaceId = tokens.teamId;

  function token(kind: SlackToken = 'bot') {
    if (kind === 'user' && !tokens.userToken) {
      throw new Error('Slack user token is required for this action. Reconnect with user scopes.');
    }

    return kind === 'user' ? tokens.userToken : tokens.botToken;
  }

  async function raw({
    path,
    method = 'POST',
    body,
    headers,
    token: tokenKind = 'bot',
  }: {
    path: string;
    method?: string;
    body?: BodyInit | Record<string, unknown>;
    headers?: HeadersInit;
    token?: SlackToken;
  }) {
    if (!safeMethod(method)) throw new Error(`Unsupported Slack API method '${method}'.`);

    const requestHeaders = new Headers(headers);
    requestHeaders.set('authorization', `Bearer ${token(tokenKind)}`);
    let requestBody: BodyInit | undefined;

    if (
      body instanceof FormData ||
      body instanceof Blob ||
      body instanceof URLSearchParams ||
      typeof body === 'string'
    ) {
      requestBody = body;
    } else if (body !== undefined) {
      requestHeaders.set('content-type', 'application/json; charset=utf-8');
      requestBody = JSON.stringify(body);
    }

    const response = await fetch(endpoint(path), {
      method,
      headers: requestHeaders,
      body: requestBody,
      redirect: 'error',
    });
    const result = await parseResponse(response);

    if (!response.ok) {
      throw new Error(`Slack request failed (${response.status}): ${response.statusText}`);
    }

    if (result && typeof result === 'object' && 'ok' in result && result.ok !== true) {
      const detail = 'error' in result ? String(result.error) : 'unknown_error';

      throw new Error(`Slack API request failed: ${detail}`);
    }

    return { status: response.status, headers: Object.fromEntries(response.headers), body: result };
  }

  async function request(
    path: string,
    body: Record<string, unknown> = {},
    tokenKind: SlackToken = 'bot',
  ) {
    const response = await raw({ path, body, token: tokenKind });

    return slackResponse.parse(response.body);
  }

  async function paginate({
    path,
    body = {},
    item,
    token: tokenKind = 'bot',
    limit,
  }: {
    path: string;
    body?: Record<string, unknown>;
    item: string;
    token?: SlackToken;
    limit?: number;
  }) {
    const values: Record<string, unknown>[] = [];
    let cursor: string | undefined;

    do {
      const response = await request(path, { ...body, cursor, limit: limit ?? 200 }, tokenKind);
      const page = response[item];

      if (Array.isArray(page)) {
        for (const value of page) {
          if (value && typeof value === 'object' && !Array.isArray(value)) {
            values.push(Object.fromEntries(Object.entries(value)));
          }
        }
      }

      const metadata = response.response_metadata;
      cursor =
        metadata && typeof metadata === 'object' && 'next_cursor' in metadata
          ? String(metadata.next_cursor || '') || undefined
          : undefined;
    } while (cursor && (limit === undefined || values.length < limit));

    return limit === undefined ? values : values.slice(0, limit);
  }

  async function workspaceId() {
    if (resolvedWorkspaceId) return resolvedWorkspaceId;

    const response = await request('auth.test');

    if (typeof response.team_id !== 'string' || !response.team_id) {
      throw new Error('Slack auth.test did not return a workspace ID.');
    }

    resolvedWorkspaceId = response.team_id;

    return resolvedWorkspaceId;
  }

  return { request, raw, paginate, token, workspaceId };
}
