import { vi } from 'vitest';

import type { FrogBotRequest } from '../../../packages/frogbot/src/types/request.js';

export const site = 'https://acme.atlassian.net';
export const api = `${site}/rest/api/3`;
export const agile = `${site}/rest/agile/1.0`;
export const token = { email: 'dana@acme.com', apiToken: 'jira-token' };
export const oauth = { accessToken: 'atlassian-token' };
export const basic = `Basic ${Buffer.from('dana@acme.com:jira-token').toString('base64')}`;

export type Call = {
  url: string;
  method: string;
  headers: Headers;
  body?: string;
  raw?: unknown;
  signal?: AbortSignal | null;
};

export type Route = (call: Call) => Response | Promise<Response>;

export const calls: Call[] = [];

export function json(value: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(status === 204 ? null : JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

/** Stubs global `fetch`, records each call, and answers with `route`. */
export function stubJira(route: Route) {
  calls.length = 0;

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      init?.signal?.throwIfAborted();

      const call = {
        url: String(input),
        method: init?.method ?? 'GET',
        headers: new Headers(init?.headers),
        body: typeof init?.body === 'string' ? init.body : undefined,
        raw: init?.body,
        signal: init?.signal,
      };

      calls.push(call);

      return route(call);
    }),
  );
}

export function body(call: Call | undefined) {
  return JSON.parse(call?.body ?? 'null');
}

export function req(credential: unknown = token, extra: Record<string, unknown> = {}) {
  return {
    frogbot: {
      connections: {
        resolvePieceCredential: vi.fn().mockResolvedValue({ auth: credential, key: {} }),
      },
    },
    user: null,
    ...extra,
  } as unknown as FrogBotRequest;
}

/** A request whose app has a `files` collection, with `create` and `findByID` spies. */
export function filesReq(credential: unknown = token) {
  const create = vi.fn(({ file }: { file: { name: string } }) =>
    Promise.resolve({ id: `file-${file.name}`, url: `/api/files/file/${file.name}` }),
  );

  const findByID = vi.fn();
  const request = req(credential, {
    headers: new Headers({ cookie: 'session=1' }),
    url: 'https://app.test/api',
  }) as unknown as { frogbot: Record<string, unknown> };

  Object.assign(request.frogbot, {
    config: {
      files: { slug: 'files' },
      _internal: { payloadConfig: Promise.resolve({ serverURL: 'https://app.test' }) },
    },
    create,
    findByID,
  });

  return { req: request as unknown as FrogBotRequest, create, findByID };
}
