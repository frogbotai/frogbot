import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildChannelGatewayEndpoints } from '../../../../packages/frogbot/src/channels/endpoints.js';

const mocks = vi.hoisted(() => ({
  host: {
    hasGatewayAdapters: vi.fn(),
    runGatewayListener: vi.fn(),
  },
}));

vi.mock('../../../../packages/frogbot/src/channels/host.js', () => ({
  getChannelHost: () => mocks.host,
}));

const endpoint = buildChannelGatewayEndpoints()[0]!;

function request(secret?: string) {
  return Object.assign(
    new Request('http://localhost/api/channels/gateway', {
      method: 'POST',
      headers: secret ? { authorization: `Bearer ${secret}` } : undefined,
    }),
    { frogbot: {} },
  );
}

describe('channel gateway cron endpoint', () => {
  beforeEach(() => {
    vi.stubEnv('FROGBOT_CHANNELS_CRON_SECRET', 'cron-secret');
    vi.stubEnv('FROGBOT_CHANNELS_CRON_DURATION_MS', '900000');

    mocks.host.hasGatewayAdapters.mockReset().mockReturnValue(true);
    mocks.host.runGatewayListener.mockReset().mockResolvedValue(true);
  });

  it.each([
    [undefined, 401],
    ['wrong', 401],
    ['cron-secret', 200],
  ])('authenticates bearer requests (%s)', async (secret, status) => {
    const response = await endpoint.handler(request(secret) as never);

    expect(response.status).toBe(status);

    if (status === 200) {
      expect(mocks.host.runGatewayListener).toHaveBeenCalledWith({
        durationMs: 600000,
        signal: expect.any(AbortSignal),
      });
    } else {
      expect(mocks.host.runGatewayListener).not.toHaveBeenCalled();
    }
  });

  it('reports an overlapping lease without starting another listener', async () => {
    mocks.host.runGatewayListener.mockResolvedValue(false);

    const response = await endpoint.handler(request('cron-secret') as never);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ ran: false });
  });

  it('does no listener work for HTTP-only channels', async () => {
    mocks.host.hasGatewayAdapters.mockReturnValue(false);

    const response = await endpoint.handler(request('cron-secret') as never);

    expect(response.status).toBe(200);
    expect(mocks.host.runGatewayListener).not.toHaveBeenCalled();
  });
});
