import { BasePayload } from 'payload';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { channelsRun } from '../../../../packages/frogbot/src/bin/channelsRun.js';

const mocks = vi.hoisted(() => ({
  destroy: vi.fn(),
  host: {
    hasGatewayAdapters: vi.fn(),
    runGatewayListener: vi.fn(),
  },
  initFrogBot: vi.fn(),
  loadConfig: vi.fn(),
}));

vi.mock('../../../../packages/frogbot/src/channels/host.js', () => ({
  getChannelHost: () => mocks.host,
}));
vi.mock('../../../../packages/frogbot/src/config/load.js', () => ({
  loadConfig: mocks.loadConfig,
}));
vi.mock('../../../../packages/frogbot/src/frogbot.js', () => ({
  initFrogBotFromPayload: mocks.initFrogBot,
}));

describe('channels:run lifecycle', () => {
  let worker: Promise<unknown> | undefined;

  beforeEach(() => {
    mocks.destroy.mockReset().mockResolvedValue(undefined);
    mocks.host.hasGatewayAdapters.mockReset().mockReturnValue(true);
    mocks.host.runGatewayListener.mockReset().mockImplementation(async ({ signal }) => {
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve()));

      return true;
    });
    mocks.loadConfig.mockReset().mockResolvedValue({
      _internal: { payloadConfig: Promise.resolve({}) },
    });
    mocks.initFrogBot.mockReset().mockResolvedValue({ destroy: mocks.destroy });

    vi.spyOn(BasePayload.prototype, 'init').mockResolvedValue(undefined);
    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit:${code}`);
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    if (worker && process.listenerCount('SIGTERM')) process.emit('SIGTERM');

    await worker;
    worker = undefined;

    vi.restoreAllMocks();
  });

  it('drains the active listener before destroying the runtime', async () => {
    worker = channelsRun().catch((error: unknown) => error);

    await vi.waitFor(() => expect(mocks.host.runGatewayListener).toHaveBeenCalledOnce());

    process.emit('SIGTERM');

    await expect(worker).resolves.toEqual(new Error('exit:0'));

    expect(mocks.host.runGatewayListener.mock.calls[0][0].signal.aborted).toBe(true);
    expect(mocks.destroy).toHaveBeenCalledOnce();
    expect(mocks.initFrogBot).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      startChannelGateway: false,
    });
  });

  it('exits cleanly without starting listener work for HTTP-only channels', async () => {
    mocks.host.hasGatewayAdapters.mockReturnValue(false);

    await expect(channelsRun()).rejects.toThrow('exit:0');

    expect(mocks.host.runGatewayListener).not.toHaveBeenCalled();
    expect(mocks.destroy).toHaveBeenCalledOnce();
  });
});
