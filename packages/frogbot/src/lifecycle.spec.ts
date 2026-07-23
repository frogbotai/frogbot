import { getPayload } from 'payload';
import { describe, expect, it, vi } from 'vitest';

import type { Frogbot } from './frogbot.js';

const payloadState = vi.hoisted(() => ({
  payload: {
    config: { collections: [] },
    secret: 'test-secret',
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
    },
    db: {},
    kv: {},
    email: {},
  },
  promise: null as Promise<unknown> | null,
}));

vi.mock('payload', () => ({
  buildConfig: vi.fn((config: unknown) => Promise.resolve(config)),
  createLocalReq: vi.fn(),
  getPayload: vi.fn(({ config }: { config: Promise<{ onInit?: (payload: unknown) => Promise<void> }> }) => {
    payloadState.promise ??= Promise.resolve(config).then(async (resolved) => {
      payloadState.payload.config = resolved as typeof payloadState.payload.config;
      await resolved.onInit?.(payloadState.payload);
      return payloadState.payload;
    });
    return payloadState.promise;
  }),
  handleEndpoints: vi.fn(),
}));

vi.mock('./bin/generateTypes.js', () => ({ writeGeneratedTypes: vi.fn(() => Promise.resolve()) }));
vi.mock('./importMap/index.js', () => ({ generateImportMap: vi.fn(() => Promise.resolve()) }));

const { sanitize } = await import('./config/sanitize.js');
const { getCachedFrogbot, getFrogbot, resetFrogbotCache } = await import('./getFrogbot.js');
const { getFrogbotInstance } = await import('./instanceRegistry.js');

describe('Frogbot lifecycle', () => {
  it('converges interleaved Payload-first and getFrogbot-first initialization', async () => {
    resetFrogbotCache();
    payloadState.promise = null;
    let lifecycleFrogbot: Frogbot | undefined;
    let releaseOnInit!: () => void;
    let signalOnInit!: () => void;
    const onInitStarted = new Promise<void>((resolve) => (signalOnInit = resolve));
    const allowOnInit = new Promise<void>((resolve) => (releaseOnInit = resolve));
    const config = sanitize({
      secret: 'test-secret',
      db: {} as never,
      collections: [{ slug: 'users', fields: [] }],
      typescript: { autoGenerate: false },
      onInit: async (frogbot) => {
        lifecycleFrogbot = frogbot;
        signalOnInit();
        await allowOnInit;
      },
    });

    const payloadConfig = await config._internal.payloadConfig;
    expect(payloadConfig.onInit).toBeTypeOf('function');
    const payloadFirst = getPayload({ config: payloadConfig });
    await Promise.race([
      onInitStarted,
      payloadFirst.then(() => Promise.reject(new Error('Payload initialized before FrogBot onInit'))),
    ]);
    expect(getFrogbotInstance(payloadState.payload)).toBe(lifecycleFrogbot);
    expect(getCachedFrogbot()).toBeNull();

    let accessorResolved = false;
    const accessorFirst = getFrogbot({ config }).then((frogbot) => {
      accessorResolved = true;
      return frogbot;
    });
    await vi.waitFor(() => expect(vi.mocked(getPayload)).toHaveBeenCalledTimes(2));
    expect(accessorResolved).toBe(false);

    releaseOnInit();
    const [payload, accessorFrogbot] = await Promise.all([payloadFirst, accessorFirst]);

    expect(payload).toBe(payloadState.payload);
    expect(accessorFrogbot).toBe(lifecycleFrogbot);
    expect(getFrogbotInstance(payloadState.payload)).toBe(lifecycleFrogbot);
    expect(getCachedFrogbot()).toBe(lifecycleFrogbot);
  });
});
