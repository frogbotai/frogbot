import { describe, expect, it, vi } from 'vitest';

import type { FrogBotSanitizedConfig } from '../../../packages/frogbot/src/config/sanitized.js';
import type { FrogBot } from '../../../packages/frogbot/src/frogbot.js';
import {
  ensureFrogBotInstance,
  registerFrogBotInstance,
} from '../../../packages/frogbot/src/instanceRegistry.js';

describe('ensureFrogBotInstance', () => {
  it('returns a registered instance without initializing', async () => {
    const payload = {};
    const frogbot = {} as FrogBot;
    const init = vi.fn();
    registerFrogBotInstance(payload, frogbot);

    await expect(ensureFrogBotInstance(payload, init)).resolves.toBe(frogbot);
    expect(init).not.toHaveBeenCalled();
  });

  it('deduplicates concurrent initialization per payload', async () => {
    const payload = {};
    const frogbot = {} as FrogBot;
    let resolve!: (value: FrogBot) => void;
    const pending = new Promise<FrogBot>((done) => {
      resolve = done;
    });
    const init = vi.fn(() => pending);

    const first = ensureFrogBotInstance(payload, init);
    const second = ensureFrogBotInstance(payload, init);
    resolve(frogbot);

    await expect(first).resolves.toBe(frogbot);
    await expect(second).resolves.toBe(frogbot);
    expect(init).toHaveBeenCalledOnce();
  });

  it('retries after initialization rejects', async () => {
    const payload = {};
    const error = new Error('registration failed');
    const frogbot = {} as FrogBot;
    const init = vi
      .fn<() => Promise<FrogBot>>()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(frogbot);

    await expect(ensureFrogBotInstance(payload, init)).rejects.toBe(error);
    await expect(ensureFrogBotInstance(payload, init)).resolves.toBe(frogbot);
    expect(init).toHaveBeenCalledTimes(2);
  });

  it('applies a newer config after pending initialization completes', async () => {
    const payload = {};
    const firstConfig = {} as FrogBotSanitizedConfig;
    const secondConfig = {} as FrogBotSanitizedConfig;
    let resolve!: () => void;
    const pending = new Promise<void>((done) => {
      resolve = done;
    });
    const frogbot = {} as FrogBot;
    const refresh = vi.fn(() => Promise.resolve());
    const init = vi.fn(async () => {
      await pending;
      registerFrogBotInstance(payload, frogbot, firstConfig, refresh);
      return frogbot;
    });

    const first = ensureFrogBotInstance(payload, init, firstConfig);
    const second = ensureFrogBotInstance(payload, init, secondConfig);
    resolve();

    await expect(first).resolves.toBe(frogbot);
    await expect(second).resolves.toBe(frogbot);
    expect(init).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledWith(secondConfig);
  });

  it('refreshes a registered instance through its entry when the instance is not from this module', async () => {
    const payload = {};
    const firstConfig = {} as FrogBotSanitizedConfig;
    const secondConfig = {} as FrogBotSanitizedConfig;
    const frogbot = {} as FrogBot;
    const refresh = vi.fn(() => Promise.resolve());
    const init = vi.fn();
    registerFrogBotInstance(payload, frogbot, firstConfig, refresh);
    vi.resetModules();
    const copy = await import('../../../packages/frogbot/src/instanceRegistry.js');

    const refreshed = await copy.ensureFrogBotInstance(payload, init, secondConfig);
    const reused = await copy.ensureFrogBotInstance(payload, init, secondConfig);

    expect(copy.ensureFrogBotInstance).not.toBe(ensureFrogBotInstance);
    expect(refreshed).toBe(frogbot);
    expect(reused).toBe(frogbot);
    expect(refresh).toHaveBeenCalledExactlyOnceWith(secondConfig);
    expect(init).not.toHaveBeenCalled();
  });
});
