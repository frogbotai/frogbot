import type { FrogBotSanitizedConfig } from 'frogbot';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  RootLayout: vi.fn(() => null),
  connection: vi.fn(() => Promise.resolve()),
  handleServerFunctions: vi.fn((args: unknown) => Promise.resolve(args)),
}));

vi.mock('@payloadcms/next/layouts', () => ({
  RootLayout: mocks.RootLayout,
  handleServerFunctions: mocks.handleServerFunctions,
}));

vi.mock('@frogbotai/ui/admin', () => ({ shallowRouteState: 'frogbotShallowRoute' }));
vi.mock('next/server.js', () => ({ connection: mocks.connection }));

const { RootLayout, handleServerFunctions } =
  await import('../../../../packages/next/src/exports/layouts.js');

const { ShallowRouteListener } =
  await import('../../../../packages/next/src/adapters/router.client.js');

async function payloadLayout(rendered: ReturnType<typeof RootLayout>) {
  const element = await rendered;

  expect(element.type).toBe(mocks.RootLayout);

  return element;
}

function makeConfig() {
  const payloadConfig = { collections: [] };
  const config = {
    _internal: { payloadConfig: Promise.resolve(payloadConfig) },
  } as unknown as FrogBotSanitizedConfig;

  return { config, payloadConfig };
}

describe('@frogbotai/next layouts', () => {
  it("RootLayout mounts the shallow-route listener inside Payload's layout", async () => {
    const { config } = makeConfig();
    const children = 'page';

    const element = await payloadLayout(
      RootLayout({ config, importMap: {}, serverFunction: vi.fn(), children }),
    );

    expect(element.props.children[0].type).toBe(ShallowRouteListener);
    expect(element.props.children[1]).toBe(children);
  });

  it('RootLayout opts into dynamic rendering before it renders', async () => {
    const { config } = makeConfig();
    let resolveConnection = () => {};

    let settled = false;

    mocks.connection.mockImplementationOnce(
      () => new Promise<void>((resolve) => (resolveConnection = resolve)),
    );

    const rendered = RootLayout({ config, importMap: {}, serverFunction: vi.fn(), children: null });
    void rendered.then(() => (settled = true));
    await Promise.resolve();

    expect(mocks.connection).toHaveBeenCalled();
    expect(settled).toBe(false);

    resolveConnection();
    await payloadLayout(rendered);
  });

  it('RootLayout forwards props with the unwrapped payload config promise', async () => {
    const { config, payloadConfig } = makeConfig();
    const serverFunction = vi.fn();

    const element = await payloadLayout(
      RootLayout({
        config,
        importMap: {},
        serverFunction,
        children: null,
      }),
    );

    expect(element.props.importMap).toEqual({});
    expect(element.props.serverFunction).toBe(serverFunction);
    await expect(element.props.config).resolves.toBe(payloadConfig);
  });

  it('RootLayout marks the html element as a FrogBot UI page and keeps html props', async () => {
    const { config } = makeConfig();

    const element = await payloadLayout(
      RootLayout({
        config,
        htmlProps: { className: 'app' },
        importMap: {},
        serverFunction: vi.fn(),
        children: null,
      }),
    );

    expect(element.props.htmlProps).toEqual({ className: 'app', 'data-fb-ui-page': '' });
  });

  it('handleServerFunctions forwards args with the unwrapped payload config promise', async () => {
    const { config, payloadConfig } = makeConfig();

    await handleServerFunctions({ name: 'form-state', args: {}, config, importMap: {} });

    const forwarded = mocks.handleServerFunctions.mock.calls[0][0] as {
      config: Promise<unknown>;
      name: string;
    };

    expect(forwarded.name).toBe('form-state');
    await expect(forwarded.config).resolves.toBe(payloadConfig);
  });

  it('RootLayout preserves a rejected payload config promise', async () => {
    const error = new Error('config failed');
    const config = {
      _internal: { payloadConfig: Promise.reject(error) },
    } as unknown as FrogBotSanitizedConfig;

    const element = await payloadLayout(
      RootLayout({
        config,
        importMap: {},
        serverFunction: vi.fn(),
        children: null,
      }),
    );

    await expect(element.props.config).rejects.toBe(error);
  });
});
