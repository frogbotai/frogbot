import { describe, expect, it, vi } from 'vitest';

import type { Frogbot } from '../../../../packages/frogbot/src/frogbot.js';
import { createGatewayHandler } from '../../../../packages/frogbot/src/server/gateway.js';

const body = JSON.stringify({
  model: 'typesafe-ai/jev',
  state: 'A refund was issued.',
  questions: { refunded: { type: 'boolean', instructions: 'Was a refund issued?' } },
});

function makeRequest() {
  return new Request('http://localhost/api/v1/evaluate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer user-token' },
    body,
  });
}

function makeFrogbot({
  user = { id: 'user-1' } as object | null,
  evaluate = () => true,
}: {
  user?: object | null;
  evaluate?: () => boolean;
} = {}) {
  const req = { user: null as object | null };
  const handler = vi.fn(async () => Response.json({ answers: { refunded: { probability: 0.9 } } }));
  const auth = vi.fn(async () => ({ user }));
  const createRequest = vi.fn(async () => req);
  const frogbot = {
    gateway: { handler },
    config: { ai: { access: { evaluate } } },
    createRequest,
    auth,
  } as unknown as Frogbot;

  return { frogbot, req, handler, auth, createRequest };
}

describe('FrogBot gateway evaluation', () => {
  it('authenticates and forwards /api/v1/evaluate with the request context', async () => {
    const { frogbot, req, handler, auth, createRequest } = makeFrogbot();

    const response = await createGatewayHandler(frogbot)(makeRequest());

    expect(response.status).toBe(200);
    expect(auth).toHaveBeenCalledOnce();
    expect(createRequest).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'http://localhost/v1/evaluate' }),
      { context: { req } },
    );
    expect(req.user).toEqual({ id: 'user-1' });
  });

  it('rejects unauthenticated requests without forwarding them', async () => {
    const { frogbot, handler } = makeFrogbot({ user: null });

    const response = await createGatewayHandler(frogbot)(makeRequest());

    expect(response.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('enforces evaluation access before forwarding the request', async () => {
    const { frogbot, handler } = makeFrogbot({ evaluate: () => false });

    const response = await createGatewayHandler(frogbot)(makeRequest());

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { type: 'permission_error' } });
    expect(handler).not.toHaveBeenCalled();
  });

  it('enforces model policy against the requested model before forwarding', async () => {
    const { frogbot, handler } = makeFrogbot({
      user: { id: 'user-1', modelAccess: 'selected', models: ['typesafe-ai/jev-latest'] },
    });

    const response = await createGatewayHandler(frogbot)(makeRequest());

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { type: 'model_not_allowed' } });
    expect(handler).not.toHaveBeenCalled();
  });
});
