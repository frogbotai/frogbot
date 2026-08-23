import type { FrogbotSanitizedConfig } from 'frogbot';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCachedFrogbot: vi.fn(() => ({
    config: {
      agents: [{ slug: 'general' }],
      chat: { enabled: true, chatsSlug: 'conversations', messagesSlug: 'turns' },
    },
  })),
  RootPage: vi.fn(() => null),
  NotFoundPage: vi.fn(() => null),
  generatePageMetadata: vi.fn((args: unknown) => Promise.resolve(args)),
}));

vi.mock('@payloadcms/next/views', () => mocks);
vi.mock('frogbot', async (importOriginal) => ({
  ...(await importOriginal<typeof import('frogbot')>()),
  getCachedFrogbot: mocks.getCachedFrogbot,
  messagesToUIMessages: (messages: Array<Record<string, unknown>>) =>
    messages.map(({ id, role, parts, metadata }) => ({
      id: String(id),
      role,
      parts,
      ...(metadata == null ? {} : { metadata }),
    })),
}));

const { ChatListView, ChatView, RootPage, NotFoundPage, generatePageMetadata } = await import(
  './views.js'
);

function makeConfig(admin?: Record<string, unknown>) {
  const payloadConfig = { admin, collections: [] };
  const config = {
    _internal: { payloadConfig: Promise.resolve(payloadConfig) },
  } as unknown as FrogbotSanitizedConfig;
  return { config, payloadConfig };
}

const params = Promise.resolve({ segments: [] });
const searchParams = Promise.resolve({});

describe('@frogbotai/next views', () => {
  it('ChatView prefetches bounded, access-filtered messages for the document route', async () => {
    const parts = [{ type: 'file', mediaType: 'image/png', url: '/api/files/1' }];
    const user = { id: 'user-1' };
    const find = vi.fn(() =>
      Promise.resolve({
        docs: [{ id: 12, role: 'assistant', parts, metadata: { source: 'test' } }],
      }),
    );

    const element = await ChatView({
      doc: { id: 'ignored-doc-id', agent: 'general' },
      payload: { config: { routes: { admin: '/admin' } }, find },
      routeSegments: ['collections', 'conversations', 'chat-1'],
      user,
    } as never);

    expect(find).toHaveBeenCalledWith({
      collection: 'turns',
      depth: 0,
      limit: 500,
      overrideAccess: false,
      sort: ['createdAt', 'id'],
      user,
      where: { chat: { equals: 'chat-1' } },
    });
    expect(element?.props).toEqual({
      agent: 'general',
      chatId: 'chat-1',
      documentPath: '/admin/collections/conversations',
      initialMessages: [
        { id: '12', role: 'assistant', parts, metadata: { source: 'test' } },
      ],
    });
  });

  it('ChatView renders an empty uncontrolled chat on the canonical create route', async () => {
    const find = vi.fn();
    const element = await ChatView({
      doc: {},
      payload: { config: { routes: { admin: '/control' } }, find },
      routeSegments: ['collections', 'conversations', 'create'],
      user: { id: 'user-1' },
    } as never);

    expect(find).not.toHaveBeenCalled();
    expect(element?.props).toEqual({
      agent: 'general',
      documentPath: '/control/collections/conversations',
      initialMessages: [],
    });
  });

  it('ChatView renders an empty uncontrolled chat on the dashboard route', async () => {
    const find = vi.fn();
    const element = await ChatView({
      doc: {},
      payload: { config: { routes: { admin: '/admin' } }, find },
      routeSegments: [],
      user: { id: 'user-1' },
    } as never);

    expect(find).not.toHaveBeenCalled();
    expect(element?.props).toEqual({
      agent: 'general',
      documentPath: '/admin/collections/conversations',
      initialMessages: [],
    });
  });

  it('ChatView does not query when canonical view auth has no user', async () => {
    const find = vi.fn();

    await expect(
      ChatView({
        doc: { id: 'chat-1', agent: 'general' },
        payload: { find },
        routeSegments: ['collections', 'conversations', 'chat-1'],
      } as never),
    ).resolves.toBeNull();
    expect(find).not.toHaveBeenCalled();
  });

  it('ChatListView queries the resolved collection with access enforcement', async () => {
    const user = { id: 'user-1' };
    const find = vi.fn(() =>
      Promise.resolve({
        docs: [
          {
            id: 'chat-1',
            agent: 'general',
            title: 'First chat',
            lastMessageAt: '2026-08-23T00:00:00.000Z',
            private: 'excluded',
          },
        ],
      }),
    );

    const element = await ChatListView({
      collectionConfig: { slug: 'conversations' },
      limit: 20,
      payload: { find },
      user,
    } as never);

    expect(find).toHaveBeenCalledWith({
      collection: 'conversations',
      depth: 0,
      limit: 20,
      overrideAccess: false,
      sort: '-lastMessageAt',
      user,
    });
    expect(element.props).toEqual({
      chats: [
        {
          id: 'chat-1',
          agent: 'general',
          title: 'First chat',
          lastMessageAt: '2026-08-23T00:00:00.000Z',
        },
      ],
      collectionSlug: 'conversations',
    });
  });

  it('RootPage forwards props with the unwrapped payload config promise', async () => {
    const { config, payloadConfig } = makeConfig();

    const element = RootPage({ config, importMap: {}, params, searchParams });

    expect(element.type).toBe(mocks.RootPage);
    expect(element.props.params).toBe(params);
    await expect(element.props.config).resolves.toBe(payloadConfig);
  });

  it('NotFoundPage forwards props with the unwrapped payload config promise', async () => {
    const { config, payloadConfig } = makeConfig();

    const element = NotFoundPage({ config, importMap: {}, params, searchParams });

    expect(element.type).toBe(mocks.NotFoundPage);
    await expect(element.props.config).resolves.toBe(payloadConfig);
  });

  it('generatePageMetadata forwards args with the unwrapped payload config promise', async () => {
    const { config, payloadConfig } = makeConfig();

    await generatePageMetadata({ config, params, searchParams });

    const forwarded = mocks.generatePageMetadata.mock.calls[0][0] as { config: Promise<unknown> };
    await expect(forwarded.config).resolves.toBe(payloadConfig);
  });

  it('generatePageMetadata injects the FrogBot favicon when admin.meta.icons is unset', async () => {
    const { config } = makeConfig({ meta: {} });

    const metadata = (await generatePageMetadata({ config, params, searchParams })) as {
      icons: Array<{ rel: string; type: string; url: string }>;
    };

    expect(metadata.icons).toHaveLength(1);
    expect(metadata.icons[0]).toMatchObject({ rel: 'icon', type: 'image/png' });
    expect(metadata.icons[0].url).toBeTruthy();
  });

  it('generatePageMetadata keeps user icons when admin.meta.icons is set', async () => {
    const icons = [{ rel: 'icon', url: '/my-favicon.png' }];
    const { config } = makeConfig({ meta: { icons } });

    const metadata = (await generatePageMetadata({ config, params, searchParams })) as {
      icons?: unknown;
    };

    expect(metadata.icons).toBeUndefined();
  });

  it('generatePageMetadata injects the FrogBot OG image for static mode without user images', async () => {
    const { config } = makeConfig({ meta: { defaultOGImageType: 'static' } });

    const metadata = (await generatePageMetadata({ config, params, searchParams })) as {
      openGraph: { images: Array<{ url: string; width: number; height: number }> };
    };

    expect(metadata.openGraph.images).toHaveLength(1);
    expect(metadata.openGraph.images[0]).toMatchObject({ width: 1200, height: 630 });
    expect(metadata.openGraph.images[0].url).toBeTruthy();
  });

  it('generatePageMetadata leaves openGraph alone when user images or non-static mode are set', async () => {
    const withImages = makeConfig({
      meta: { defaultOGImageType: 'static', openGraph: { images: [{ url: '/og.png' }] } },
    });
    const dynamicMode = makeConfig({ meta: { defaultOGImageType: 'dynamic' } });

    const a = (await generatePageMetadata({ config: withImages.config, params, searchParams })) as {
      openGraph?: unknown;
    };
    const b = (await generatePageMetadata({
      config: dynamicMode.config,
      params,
      searchParams,
    })) as {
      openGraph?: unknown;
    };

    expect(a.openGraph).toBeUndefined();
    expect(b.openGraph).toBeUndefined();
  });
});
