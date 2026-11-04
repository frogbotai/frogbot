import { vi } from 'vitest';

import type { FrogBotRequest } from '../../../packages/frogbot/src/types/request.js';

export const api = 'https://app.asana.com/api/1.0';
export const token = { accessToken: 'asana-token' };

export type Call = {
  url: string;
  method: string;
  headers: Headers;
  body?: string;
  signal?: AbortSignal | null;
};

export type Route = (call: Call) => Response | Promise<Response>;

export const calls: Call[] = [];

export function json(value: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

/** Stubs global `fetch`, records each call, and answers with `route`. */
export function stubAsana(route: Route) {
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

export function query(call: Call | undefined) {
  return Object.fromEntries(new URL(call?.url ?? api).searchParams);
}

export function req(extra: Record<string, unknown> = {}) {
  return {
    frogbot: {
      connections: {
        resolvePieceCredential: vi.fn().mockResolvedValue({ auth: token, key: {} }),
      },
    },
    user: null,
    ...extra,
  } as unknown as FrogBotRequest;
}

/** A request whose app has a `files` collection, with a `create` spy. */
export function filesReq() {
  const create = vi.fn(({ file }: { file: { name: string } }) =>
    Promise.resolve({ id: `file-${file.name}`, url: `/api/files/file/${file.name}` }),
  );

  const request = req() as unknown as { frogbot: Record<string, unknown> };

  Object.assign(request.frogbot, { config: { files: { slug: 'files' } }, create });

  return { req: request as unknown as FrogBotRequest, create };
}
