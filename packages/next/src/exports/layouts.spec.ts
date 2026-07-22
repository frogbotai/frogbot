import { describe, expect, it, vi } from 'vitest';

import type { FrogbotSanitizedConfig } from 'frogbot';

const mocks = vi.hoisted(() => ({
  RootLayout: vi.fn(() => null),
  handleServerFunctions: vi.fn((args: unknown) => Promise.resolve(args)),
}));

vi.mock('@payloadcms/next/layouts', () => mocks);

const { RootLayout, handleServerFunctions } = await import('./layouts.js');

function makeConfig() {
  const payloadConfig = { collections: [] };
  const config = {
    _internal: { payloadConfig: Promise.resolve(payloadConfig) },
  } as unknown as FrogbotSanitizedConfig;
  return { config, payloadConfig };
}

describe('@frogbotai/next layouts', () => {
  it('RootLayout forwards props with the unwrapped payload config promise', async () => {
    const { config, payloadConfig } = makeConfig();
    const serverFunction = vi.fn();

    const element = RootLayout({
      config,
      importMap: {},
      serverFunction,
      children: null,
    });

    expect(element.type).toBe(mocks.RootLayout);
    expect(element.props.importMap).toEqual({});
    expect(element.props.serverFunction).toBe(serverFunction);
    await expect(element.props.config).resolves.toBe(payloadConfig);
  });

  it('handleServerFunctions forwards args with the unwrapped payload config promise', async () => {
    const { config, payloadConfig } = makeConfig();

    await handleServerFunctions({ name: 'form-state', args: {}, config, importMap: {} });

    const forwarded = mocks.handleServerFunctions.mock.calls[0][0] as { config: Promise<unknown>; name: string };
    expect(forwarded.name).toBe('form-state');
    await expect(forwarded.config).resolves.toBe(payloadConfig);
  });
});
