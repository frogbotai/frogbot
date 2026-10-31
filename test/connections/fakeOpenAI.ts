import { createServer, type IncomingHttpHeaders, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { zstdDecompressSync } from 'node:zlib';

import { vi } from 'vitest';

import {
  completedEvent,
  type ResponsesEvent,
  textEvents,
} from '../__helpers/shared/openaiResponses.js';
import { idToken, signingKey } from './chatgpt.js';

/** A request the fake OpenAI got, with its body decoded from zstd when it was sent compressed. */
export type Received = {
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
  body: string;
  bytes: number;
  at: number;
};

/** What the token endpoint puts in the ID token and grant for one authorization code. */
export type Grant = {
  nonce?: string;
  sub?: string;
  email?: string;
  scope?: string | null;
  claims?: Record<string, unknown>;
  idToken?: string | null;
};

type Reply = (res: ServerResponse, received: Received) => Promise<void> | void;

const PLAN_SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';

export const ISSUER = 'https://auth.openai.com';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Writes `events` as server-sent events, `gapMs` apart, as the plan route streams them. */
export function sse(events: ResponsesEvent[], gapMs = 0): Reply {
  return async (res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });

    for (const event of events) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      if (gapMs) await wait(gapMs);
    }

    res.end();
  };
}

/** A JSON answer with `status`. */
export function json(status: number, body: unknown): Reply {
  return (res) => {
    res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
  };
}

/** A reply that says `text`: streamed when the request asked to stream, else one JSON answer. */
export const say =
  (text: string): Reply =>
  (res, received) => {
    if ((JSON.parse(received.body) as { stream?: boolean }).stream) {
      return sse([...textEvents(text), completedEvent])(res, received);
    }

    return json(200, {
      id: 'resp_1',
      object: 'response',
      created_at: 1,
      model: 'gpt-5.5',
      status: 'completed',
      output: [
        {
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'output_text', text, annotations: [] }],
        },
      ],
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
    })(res, received);
  };

/**
 * A fake auth.openai.com and api.openai.com on a real `127.0.0.1` HTTP server. `fetch` is stubbed
 * to forward those two origins to it unchanged, so bodies, headers and streams cross a socket.
 * `responses` queues replies for `POST /v1/responses` (then each says "ok"), `grants` holds what
 * the token endpoint issues for each authorization code, `refresh` shapes refresh answers, and
 * `keyModels` can answer `GET /v1/models` for a pasted key.
 */
export async function startFakeOpenAI() {
  const key = signingKey('fake-openai');

  const fake = {
    key,
    received: [] as Received[],
    responses: [] as Reply[],
    grants: new Map<string, Grant>(),
    refresh: {
      count: 0,
      fail: 0,
      omitRefreshToken: false,
    },
    revokeStatus: 200,
    planModels: [
      { slug: 'gpt-5.5', visibility: 'list', supported_in_api: true },
      { slug: 'gpt-6-sol', visibility: 'list', supported_in_api: true },
    ] as Record<string, unknown>[],
    keyModels: (_key: string): Reply | undefined => undefined,
    reset() {
      fake.received.length = 0;
      fake.responses.length = 0;
      fake.grants.clear();
      fake.refresh.count = 0;
      fake.refresh.fail = 0;
      fake.refresh.omitRefreshToken = false;
      fake.revokeStatus = 200;
      fake.keyModels = () => undefined;
    },
    calls: (path: string) => fake.received.filter((received) => received.path === path),
    origin: '',
    close: () => Promise.resolve(),
  };

  const tokensFor = (form: URLSearchParams): Reply => {
    const clientId = form.get('client_id') ?? '';

    if (form.get('grant_type') === 'refresh_token') {
      fake.refresh.count++;

      if (fake.refresh.fail) return json(fake.refresh.fail, { error: 'invalid_grant' });

      const n = fake.refresh.count;

      return json(200, {
        access_token: `refreshed-access-${n}`,
        ...(fake.refresh.omitRefreshToken ? {} : { refresh_token: `refreshed-refresh-${n}` }),
        expires_in: 3600,
        token_type: 'Bearer',
      });
    }

    const code = form.get('code') ?? '';
    const grant = fake.grants.get(code);

    if (!grant) return json(400, { error: 'invalid_grant' });

    const now = Math.floor(Date.now() / 1000);
    const claims = {
      iss: ISSUER,
      aud: clientId,
      sub: grant.sub ?? 'chatgpt-user',
      email: grant.email ?? 'user@chat.test',
      nonce: grant.nonce,
      iat: now,
      exp: now + 600,
      ...grant.claims,
    };

    return json(200, {
      access_token: `plan-access-${code}`,
      refresh_token: `plan-refresh-${code}`,
      ...(grant.idToken === null ? {} : { id_token: grant.idToken ?? idToken(key, claims) }),
      expires_in: 3600,
      token_type: 'Bearer',
      ...(grant.scope === null ? {} : { scope: grant.scope ?? PLAN_SCOPES }),
    });
  };

  const route = (received: Received): Reply => {
    const { method, path, headers } = received;
    const bearer = String(headers.authorization ?? '').replace(/^Bearer /, '');

    if (path === '/auth/.well-known/jwks.json') return json(200, { keys: [key.jwk] });

    if (path === '/auth/.well-known/openid-configuration') {
      return json(200, { issuer: ISSUER, revocation_endpoint: `${ISSUER}/oauth/revoke` });
    }

    if (path === '/auth/oauth/revoke') return json(fake.revokeStatus, {});

    if (path === '/auth/api/accounts/oauth/token' && method === 'POST') {
      return tokensFor(new URLSearchParams(received.body));
    }

    if (path === '/api/v1/models') {
      if (bearer.startsWith('sk-')) {
        return (
          fake.keyModels(bearer) ??
          json(200, { object: 'list', data: [{ id: 'gpt-5.5' }, { id: 'gpt-4o-mini' }] })
        );
      }

      return json(200, { models: fake.planModels });
    }

    if (path === '/api/v1/responses') return fake.responses.shift() ?? say('ok');

    return json(404, { error: { message: `No fake route for ${method} ${path}.` } });
  };

  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];

    req.on('data', (chunk: Buffer) => chunks.push(chunk));

    req.on('end', () => {
      const raw = Buffer.concat(chunks);
      const body = req.headers['content-encoding'] === 'zstd' ? zstdDecompressSync(raw) : raw;

      const received: Received = {
        method: req.method ?? 'GET',
        path: new URL(req.url ?? '/', 'http://fake').pathname,
        headers: req.headers,
        body: body.toString(),
        bytes: raw.length,
        at: Date.now(),
      };

      fake.received.push(received);
      void Promise.resolve(route(received)(res, received)).catch(() => res.destroy());
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  fake.origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  fake.close = () =>
    new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    });

  const realFetch = globalThis.fetch;

  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const forwarded = url
      .replace(/^https:\/\/auth\.openai\.com\//, `${fake.origin}/auth/`)
      .replace(/^https:\/\/api\.openai\.com\//, `${fake.origin}/api/`);

    if (forwarded === url) return realFetch(input, init);

    return input instanceof Request
      ? realFetch(new Request(forwarded, input), init)
      : realFetch(forwarded, init);
  });

  return fake;
}

export type FakeOpenAI = Awaited<ReturnType<typeof startFakeOpenAI>>;
