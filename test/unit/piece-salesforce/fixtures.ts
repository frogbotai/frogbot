import { vi } from 'vitest';

import type { FrogBotRequest } from '../../../packages/frogbot/src/types/request.js';

export const instance = 'https://acme.my.salesforce.com';
export const data = '/services/data/v68.0';
export const auth = {
  accessToken: 'salesforce-token',
  instanceUrl: instance,
  identityUrl: 'https://login.salesforce.com/id/00D000000000001AAA/005000000000001AAA',
};

export type Call = {
  url: string;
  method: string;
  headers: Headers;
  body?: string;
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
export function stubSalesforce(route: Route) {
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
  return Object.fromEntries(new URL(call?.url ?? instance).searchParams);
}

export function path(call: Call | undefined) {
  return new URL(call?.url ?? instance).pathname;
}

export function req(extra: Record<string, unknown> = {}) {
  return {
    frogbot: {
      connections: {
        resolvePieceCredential: vi.fn().mockResolvedValue({ auth, key: {} }),
      },
    },
    user: null,
    ...extra,
  } as unknown as FrogBotRequest;
}
