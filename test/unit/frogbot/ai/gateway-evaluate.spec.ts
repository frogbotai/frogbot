import { describe, expect, it, vi } from 'vitest';

import type { FrogBot } from '../../../../packages/frogbot/src/frogbot.js';
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

function makeFrogBot({
  user = { id: 'user-1' },
  evaluate = () => true,
}: {
  user?: object | null;
  evaluate?: (args: { req: unknown; model: string }) => boolean;
} = {}) {
  const req = { user: null as object | null };
  const handler = vi.fn(() =>
    Promise.resolve(Response.json({ answers: { refunded: { probability: 0.9 } } })),
  );

  const auth = vi.fn(() => Promise.resolve({ user }));
  const createRequest = vi.fn(() => Promise.resolve(req));
  const frogbot = {
    gateway: { handler },
    config: { ai: { access: { evaluate } } },
    createRequest,
    auth,
  } as unknown as FrogBot;

  return { frogbot, req, handler, auth, createRequest };
}

describe('FrogBot gateway evaluation', () => {
  it('authenticates and forwards /api/v1/evaluate with the request context', async () => {
    const { frogbot, req, handler, auth, createRequest } = makeFrogBot();

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
    const { frogbot, handler } = makeFrogBot({ user: null });

    const response = await createGatewayHandler(frogbot)(makeRequest());

    expect(response.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('enforces evaluation access before forwarding the request', async () => {
    const { frogbot, handler } = makeFrogBot({ evaluate: () => false });

    const response = await createGatewayHandler(frogbot)(makeRequest());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        message: 'Access denied for AI evaluate',
        type: 'permission_error',
        code: 'permission_denied',
        param: null,
      },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('passes the requested model to access and renders its coded error', async () => {
    const evaluate = vi.fn(({ model }: { model: string }) => {
      if (model === 'typesafe-ai/jev-latest') return true;

      throw Object.assign(new Error('Model not allowed'), {
        status: 403,
        code: 'model_not_allowed',
      });
    });

    const { frogbot, req, handler } = makeFrogBot({ evaluate });

    const response = await createGatewayHandler(frogbot)(makeRequest());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        message: 'Model not allowed',
        type: 'permission_error',
        code: 'model_not_allowed',
        param: null,
      },
    });
    expect(evaluate).toHaveBeenCalledExactlyOnceWith({ req, model: 'typesafe-ai/jev' });
    expect(handler).not.toHaveBeenCalled();
  });
});
