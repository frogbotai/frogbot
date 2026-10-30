import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FrogBot } from '../../../../packages/frogbot/src/frogbot.js';
import { createGatewayHandler } from '../../../../packages/frogbot/src/server/gateway.js';

type Rule = (args: { req: unknown; model: string }) => boolean;

const models = [
  { id: 'openai/gpt-4.1', object: 'model' },
  { id: 'openai/gpt-4o', object: 'model' },
  { id: 'openai/text-embedding-3-small', object: 'model' },
];

function makeRequest() {
  return new Request('http://localhost/api/v1/models', {
    headers: { authorization: 'Bearer user-token' },
  });
}

function makeFrogBot({
  user = { id: 'user-1' },
  access = {},
  response = () => Response.json({ object: 'list', data: models }),
}: {
  user?: object | null;
  access?: { generate?: Rule; embed?: Rule };
  response?: () => Response;
} = {}) {
  const ai = { access };
  const req = { user: null as object | null, frogbot: { config: { ai } } };
  const handler = vi.fn(() => Promise.resolve(response()));

  const auth = vi.fn(() => Promise.resolve({ user }));
  const createRequest = vi.fn(() => Promise.resolve(req));
  const frogbot = {
    gateway: { handler },
    config: { ai },
    createRequest,
    auth,
  } as unknown as FrogBot;

  return { frogbot, handler };
}

async function listedIds(response: Response) {
  const body = (await response.json()) as { data: { id: string }[] };

  return body.data.map(({ id }) => id);
}

describe('FrogBot gateway model discovery', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('lists only the models the generate rule allows', async () => {
    const { frogbot } = makeFrogBot({
      access: { generate: ({ model }) => model === 'openai/gpt-4.1' },
    });

    const response = await createGatewayHandler(frogbot)(makeRequest());
    const body = (await response.json()) as { object: string; data: { id: string }[] };

    expect(response.status).toBe(200);
    expect(body.object).toBe('list');
    expect(body.data.map(({ id }) => id)).toEqual([
      'openai/gpt-4.1',
      'openai/text-embedding-3-small',
    ]);
  });

  it('returns the full list when there are no access rules', async () => {
    const { frogbot } = makeFrogBot();

    const response = await createGatewayHandler(frogbot)(makeRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ object: 'list', data: models });
  });

  it('hides a model whose rule throws an error with a status', async () => {
    const { frogbot } = makeFrogBot({
      access: {
        generate: ({ model }) => {
          if (model === 'openai/gpt-4o') {
            throw Object.assign(new Error('Model not allowed'), { status: 403 });
          }

          return true;
        },
      },
    });

    const response = await createGatewayHandler(frogbot)(makeRequest());

    expect(await listedIds(response)).toEqual(['openai/gpt-4.1', 'openai/text-embedding-3-small']);
  });

  it('fails with a 500 OpenAI error when a rule throws an error without a status', async () => {
    const { frogbot } = makeFrogBot({
      access: {
        generate: () => {
          throw new Error('Policy store unavailable');
        },
      },
    });

    const response = await createGatewayHandler(frogbot)(makeRequest());
    const body = (await response.json()) as { error: { type: string; message: string } };

    expect(response.status).toBe(500);
    expect(body.error.type).toBe('server_error');
    expect(body.error.message).toEqual(expect.any(String));
  });

  it('masks the failing rule message in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const { frogbot } = makeFrogBot({
      access: {
        generate: () => {
          throw new Error('postgres://admin:secret@db/policies unreachable');
        },
      },
    });

    const response = await createGatewayHandler(frogbot)(makeRequest());
    const body = (await response.json()) as { error: { message: string } };

    expect(response.status).toBe(500);
    expect(body.error.message).not.toContain('secret');
  });

  it('fails the whole list when any rule errors, even if others deny with a status', async () => {
    const { frogbot } = makeFrogBot({
      access: {
        generate: ({ model }) => {
          if (model === 'openai/gpt-4o') throw new Error('Policy store unavailable');

          throw Object.assign(new Error('Model not allowed'), { status: 403 });
        },
      },
    });

    const response = await createGatewayHandler(frogbot)(makeRequest());

    expect(response.status).toBe(500);
  });

  it('filters a request with a query string', async () => {
    const { frogbot } = makeFrogBot({
      access: { generate: () => false, embed: () => false },
    });

    const response = await createGatewayHandler(frogbot)(
      new Request('http://localhost/api/v1/models?limit=10', {
        headers: { authorization: 'Bearer user-token' },
      }),
    );

    expect(response.status).toBe(200);
    expect(await listedIds(response)).toEqual([]);
  });

  it("keeps the gateway's headers but not its content-length", async () => {
    const full = JSON.stringify({ object: 'list', data: models });
    const { frogbot } = makeFrogBot({
      access: { generate: ({ model }) => model === 'openai/gpt-4.1' },
      response: () =>
        new Response(full, {
          headers: {
            'content-type': 'application/json',
            'content-length': String(full.length),
            'x-request-id': 'req-1',
          },
        }),
    });

    const response = await createGatewayHandler(frogbot)(makeRequest());
    const text = await response.text();

    expect(response.headers.get('x-request-id')).toBe('req-1');
    expect(response.headers.get('content-length')).not.toBe(String(full.length));
    expect(JSON.parse(text)).toEqual({
      object: 'list',
      data: [models[0], models[2]],
    });
  });

  it('checks embedding models with the embed rule, not generate', async () => {
    const embedOnly = makeFrogBot({ access: { generate: () => false, embed: () => true } });
    const generateOnly = makeFrogBot({ access: { generate: () => true, embed: () => false } });

    const embedResponse = await createGatewayHandler(embedOnly.frogbot)(makeRequest());
    const generateResponse = await createGatewayHandler(generateOnly.frogbot)(makeRequest());

    expect(await listedIds(embedResponse)).toEqual(['openai/text-embedding-3-small']);
    expect(await listedIds(generateResponse)).toEqual(['openai/gpt-4.1', 'openai/gpt-4o']);
  });

  it('rejects unauthenticated requests without calling the gateway', async () => {
    const { frogbot, handler } = makeFrogBot({ user: null });

    const response = await createGatewayHandler(frogbot)(makeRequest());

    expect(response.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns a non-200 response and a body without an array data unchanged', async () => {
    const failed = Response.json({ error: { message: 'Upstream down' } }, { status: 502 });
    const unlisted = Response.json({ object: 'list', data: null });
    const failing = makeFrogBot({ access: { generate: () => false }, response: () => failed });
    const malformed = makeFrogBot({ access: { generate: () => false }, response: () => unlisted });

    expect(await createGatewayHandler(failing.frogbot)(makeRequest())).toBe(failed);
    expect(await createGatewayHandler(malformed.frogbot)(makeRequest())).toBe(unlisted);
  });
});
