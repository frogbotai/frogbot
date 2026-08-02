import { describe, expect, it, vi } from 'vitest';

import type { Frogbot } from './frogbot.js';
import type { FrogbotSanitizedConfig } from './types/sanitized.js';
import {
  ensureFrogbotInstance,
  refreshFrogbotConfig,
  registerFrogbotInstance,
} from './instanceRegistry.js';

describe('ensureFrogbotInstance', () => {
  it('returns a registered instance without initializing', async () => {
    const payload = {};
    const frogbot = {} as Frogbot;
    const init = vi.fn();
    registerFrogbotInstance(payload, frogbot);

    await expect(ensureFrogbotInstance(payload, init)).resolves.toBe(frogbot);
    expect(init).not.toHaveBeenCalled();
  });

  it('deduplicates concurrent initialization per payload', async () => {
    const payload = {};
    const frogbot = {} as Frogbot;
    let resolve!: (value: Frogbot) => void;
    const pending = new Promise<Frogbot>((done) => {
      resolve = done;
    });
    const init = vi.fn(() => pending);

    const first = ensureFrogbotInstance(payload, init);
    const second = ensureFrogbotInstance(payload, init);
    resolve(frogbot);

    await expect(first).resolves.toBe(frogbot);
    await expect(second).resolves.toBe(frogbot);
    expect(init).toHaveBeenCalledOnce();
  });

  it('retries after initialization rejects', async () => {
    const payload = {};
    const error = new Error('registration failed');
    const frogbot = {} as Frogbot;
    const init = vi
      .fn<() => Promise<Frogbot>>()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(frogbot);

    await expect(ensureFrogbotInstance(payload, init)).rejects.toBe(error);
    await expect(ensureFrogbotInstance(payload, init)).resolves.toBe(frogbot);
    expect(init).toHaveBeenCalledTimes(2);
  });

  it('applies a newer config after pending initialization completes', async () => {
    const payload = {};
    const firstConfig = {} as FrogbotSanitizedConfig;
    const secondConfig = {} as FrogbotSanitizedConfig;
    let resolve!: () => void;
    const pending = new Promise<void>((done) => {
      resolve = done;
    });
    const frogbot = {
      [refreshFrogbotConfig]: vi.fn(() => Promise.resolve()),
    } as unknown as Frogbot;
    const init = vi.fn(async () => {
      await pending;
      registerFrogbotInstance(payload, frogbot, firstConfig);
      return frogbot;
    });

    const first = ensureFrogbotInstance(payload, init, firstConfig);
    const second = ensureFrogbotInstance(payload, init, secondConfig);
    resolve();

    await expect(first).resolves.toBe(frogbot);
    await expect(second).resolves.toBe(frogbot);
    expect(init).toHaveBeenCalledOnce();
    expect(frogbot[refreshFrogbotConfig]).toHaveBeenCalledWith(secondConfig);
  });
});
