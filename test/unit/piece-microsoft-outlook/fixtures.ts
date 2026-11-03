import { vi } from 'vitest';

import type { FrogBotRequest } from '../../../packages/frogbot/src/types/request.js';

export const delegated = {
  accessToken: 'user-token',
  cloud: 'login.microsoftonline.com',
  tenantId: 'common',
};

export const appOnly = {
  tenantId: 'contoso.onmicrosoft.com',
  clientId: 'app-id',
  clientSecret: 'app-secret',
  mailbox: 'sales@acme.com',
};

export type Call = { url: string; method: string; headers: Headers; body?: string };

export type Route = (call: Call) => Response | Promise<Response>;

export const calls: Call[] = [];

export function json(value: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(status === 204 ? null : JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

/** Stubs global `fetch`, records each call, and answers with `route`. */
export function stubGraph(route: Route) {
  calls.length = 0;

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      init?.signal?.throwIfAborted();

      const call = {
        url: String(input),
        method: init?.method ?? 'GET',
        headers: new Headers(init?.headers),
        body: init?.body === undefined ? undefined : String(init.body),
      };

      calls.push(call);

      return route(call);
    }),
  );
}

export function body(call: Call | undefined) {
  return JSON.parse(call?.body ?? 'null');
}

export function req(credential: unknown = delegated, extra: Record<string, unknown> = {}) {
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
