import { generateText } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { createAIGateway } from '../../../../packages/frogbot/src/ai/init.js';
import type { SanitizedAIConfig } from '../../../../packages/frogbot/src/ai/types.js';
import { ConnectionError } from '../../../../packages/frogbot/src/connections/api.js';
import { definePiece } from '../../../../packages/frogbot/src/pieces/definePiece.js';
import type { PieceInstance } from '../../../../packages/frogbot/src/pieces/types.js';

const MODEL = 'openai/gpt-4o-mini';

const keyAuth = z.object({ apiKey: z.string() });

type Via = 'app' | 'http';

let vias: Via[];
let credentialError: Error | undefined;
let authorizations: (string | null)[];

const createKeyed = definePiece({
  slug: 'openai',
  label: 'OpenAI',
  auth: keyAuth,
  client: ({ auth }: { auth: unknown }) => auth,
  provider: {
    name: 'openai',
    credential: ({ auth, via }: { auth: unknown; via: Via }) => {
      vias.push(via);
      if (credentialError) throw credentialError;

      return { apiKey: keyAuth.parse(auth).apiKey };
    },
  },
  actions: [],
});

function aiConfig(piece: PieceInstance, apiKey?: string): SanitizedAIConfig {
  return {
    providers: { openai: apiKey ? { apiKey } : true },
    linkedProviders: { openai: piece },
    routers: {},
    hooks: {
      beforeOperation: [],
      beforeUpstream: [],
      afterUpstream: [],
      afterError: [],
      afterOperation: [],
    },
    access: {
      generate: () => true,
      embed: () => true,
      transcribe: () => true,
      rerank: () => true,
      evaluate: () => true,
    },
    telemetry: { enabled: false },
    usage: { slug: 'ai-usage' },
    _internal: { deploymentId: 'test' },
  };
}

function request(resolve: () => Promise<{ auth: unknown; key: object }>) {
  return { frogbot: { connections: { resolvePieceCredential: vi.fn(resolve) } } };
}

const linked = (apiKey: string) => request(() => Promise.resolve({ auth: { apiKey }, key: {} }));

const failing = (code: ConnectionError['code']) =>
  request(() => Promise.reject(new ConnectionError('Connection failed.', code)));

async function run({ apiKey, req }: { apiKey?: string; req?: object }) {
  const gateway = createAIGateway(aiConfig(createKeyed(), apiKey));
  const op = gateway.operation({ operation: 'chat.completions', model: MODEL, context: { req } });

  try {
    await generateText({ model: op.chatModel(), prompt: 'hi', maxRetries: 0 });
  } catch (error) {
    return error;
  }

  throw new Error('expected the call to fail');
}

beforeEach(() => {
  vias = [];
  credentialError = undefined;
  authorizations = [];
  vi.stubEnv('OPENAI_API_KEY', undefined);

  vi.stubGlobal(
    'fetch',
    vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      authorizations.push(new Headers(init?.headers).get('authorization'));

      return Promise.resolve(
        Response.json(
          { error: { message: 'bad key', type: 'invalid_request_error' } },
          { status: 401 },
        ),
      );
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('linked provider credential', () => {
  it("sends the user's linked key, passing the gateway's via to the piece", async () => {
    await run({ apiKey: 'sk-app', req: linked('sk-user') });

    expect(authorizations).toEqual(['Bearer sk-user']);
    expect(vias).toEqual(['app']);
  });

  it('uses the app key for a user with no linked account', async () => {
    await run({ apiKey: 'sk-app', req: failing('missing') });

    expect(authorizations).toEqual(['Bearer sk-app']);
  });

  it('uses OPENAI_API_KEY as the app key when ai.providers has none', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-env');

    await run({});

    expect(authorizations).toEqual(['Bearer sk-env']);
  });

  it('fails with the setup error and no request when there is no linked account or app key', async () => {
    for (const req of [undefined, failing('missing')]) {
      await expect(run({ req })).resolves.toMatchObject({
        status: 401,
        message: "OpenAI isn't set up. Add your OpenAI key in Settings → Linked accounts.",
      });
    }

    expect(authorizations).toEqual([]);
  });

  it('fails with "Reconnect" and never falls back to the app key for an unusable account', async () => {
    for (const code of ['revoked', 'expired', 'error', 'scopes'] as const) {
      await expect(run({ apiKey: 'sk-app', req: failing(code) })).resolves.toMatchObject({
        status: 401,
        message: 'Reconnect OpenAI in Settings → Linked accounts.',
      });
    }

    expect(authorizations).toEqual([]);
  });

  it("passes the piece's own credential error through unchanged, with no app-key request", async () => {
    credentialError = new Error('Sign in to ChatGPT again.');

    const error = await run({ apiKey: 'sk-app', req: linked('sk-user') });

    expect(error).toBe(credentialError);
    expect(authorizations).toEqual([]);
  });

  it("wraps the linked account's model in the piece's middleware", async () => {
    const createWrapped = definePiece({
      slug: 'openai',
      label: 'OpenAI',
      auth: keyAuth,
      client: ({ auth }: { auth: unknown }) => auth,
      provider: {
        name: 'openai',
        credential: ({ auth }) => ({ apiKey: keyAuth.parse(auth).apiKey }),
        middleware: ({ auth }) => ({
          specificationVersion: 'v4',
          transformParams: ({ params }) =>
            Promise.resolve({
              ...params,
              headers: { ...params.headers, 'x-account': keyAuth.parse(auth).apiKey },
            }),
        }),
      },
      actions: [],
    });

    const headers: (string | null)[] = [];

    vi.mocked(globalThis.fetch).mockImplementation((_input, init) => {
      headers.push(new Headers(init?.headers).get('x-account'));

      return Promise.resolve(Response.json({ error: { message: 'bad key' } }, { status: 401 }));
    });

    const gateway = createAIGateway(aiConfig(createWrapped(), 'sk-app'));
    const call = (req?: object) =>
      generateText({
        model: gateway
          .operation({ operation: 'chat.completions', model: MODEL, context: { req } })
          .chatModel(),
        prompt: 'hi',
        maxRetries: 0,
      }).catch(() => undefined);

    await call(linked('sk-user'));
    await call(failing('missing'));

    expect(headers).toEqual(['sk-user', null]);
  });
});
