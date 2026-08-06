import { importExportPlugin } from '@frogbotai/plugin-import-export';
import { nestedDocsPlugin } from '@frogbotai/plugin-nested-docs';
import { redirectsPlugin } from '@frogbotai/plugin-redirects';
import { searchPlugin } from '@frogbotai/plugin-search';
import { sentryPlugin } from '@frogbotai/plugin-sentry';
import { stripePlugin } from '@frogbotai/plugin-stripe';
import { buildConfig, type FrogbotConfig } from 'frogbot';
import { describe, expect, it, vi } from 'vitest';

function baseConfig(overrides: Partial<FrogbotConfig> = {}): FrogbotConfig {
  return {
    secret: 'test-secret',
    db: { defaultIDType: 'number' } as never,
    collections: [{ slug: 'posts', fields: [{ name: 'title', type: 'text' }] }],
    ...overrides,
  };
}

async function payloadConfig(config: FrogbotConfig) {
  return await (await buildConfig(config))._internal.payloadConfig;
}

describe('Payload plugin adapters', () => {
  it('boots import-export and preserves collection, admin, jobs, and override config', async () => {
    const appProvider = 'app/provider#Provider';
    const appTask = { inputSchema: [], outputSchema: [], handler: vi.fn(), slug: 'app-task' } as never;
    const config = await payloadConfig(baseConfig({
      admin: { components: { providers: [appProvider] } },
      jobs: { tasks: [appTask] },
      plugins: [importExportPlugin({
        collections: [{ slug: 'posts', import: false }],
        overrideExportCollection: ({ collection }) => ({ ...collection, slug: 'app-exports' }),
        overrideImportCollection: ({ collection }) => ({ ...collection, slug: 'app-imports' }),
      })],
    }));

    expect(config.collections.map(({ slug }) => slug)).toEqual(expect.arrayContaining(['posts', 'app-exports', 'app-imports']));
    expect(config.admin?.components?.providers).toEqual(expect.arrayContaining([appProvider, '@payloadcms/plugin-import-export/rsc#ImportExportProvider']));
    expect(config.jobs?.tasks).toEqual(expect.arrayContaining([appTask]));
    expect(config.jobs?.tasks).toHaveLength(3);
  });

  it('boots nested-docs and preserves app fields and hooks', async () => {
    const appHook = vi.fn();
    const config = await payloadConfig(baseConfig({
      collections: [{ slug: 'pages', fields: [{ name: 'title', type: 'text' }], hooks: { beforeChange: [appHook] } }],
      plugins: [nestedDocsPlugin({ collections: ['pages'] })],
    }));
    const pages = config.collections.find(({ slug }) => slug === 'pages');

    expect(pages?.fields).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'title' }), expect.objectContaining({ name: 'parent' }), expect.objectContaining({ name: 'breadcrumbs' })]));
    expect(pages?.hooks?.beforeChange).toContain(appHook);
  });

  it('boots redirects and preserves collection overrides and app collections', async () => {
    const config = await payloadConfig(baseConfig({
      plugins: [redirectsPlugin({
        collections: ['posts'],
        overrides: { admin: { group: 'App' }, slug: 'app-redirects' },
      })],
    }));
    const redirects = config.collections.find(({ slug }) => slug === 'app-redirects');

    expect(config.collections.find(({ slug }) => slug === 'posts')).toBeDefined();
    expect(redirects?.admin?.group).toBe('App');
  });

  it('boots search and preserves search collection and app hook overrides', async () => {
    const appHook = vi.fn();
    const config = await payloadConfig(baseConfig({
      collections: [{ slug: 'posts', fields: [{ name: 'title', type: 'text' }], hooks: { afterChange: [appHook] } }],
      plugins: [searchPlugin({
        collections: ['posts'],
        searchOverrides: {
          fields: ({ defaultFields }) => [...defaultFields, { name: 'appField', type: 'text' }],
          slug: 'app-search',
        },
      })],
    }));
    const posts = config.collections.find(({ slug }) => slug === 'posts');
    const search = config.collections.find(({ slug }) => slug === 'app-search');

    expect(posts?.hooks?.afterChange).toContain(appHook);
    expect(search?.fields).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'appField' })]));
  });

  it('boots sentry and preserves app providers and error hooks', async () => {
    const appHook = vi.fn();
    const appProvider = 'app/provider#Provider';
    const config = await payloadConfig(baseConfig({
      admin: { components: { providers: [appProvider] } },
      hooks: { afterError: [appHook] },
      plugins: [sentryPlugin({ Sentry: { captureException: vi.fn(() => 'event-id') } })],
    }));

    expect(config.admin?.components?.providers).toEqual(expect.arrayContaining([appProvider, '@payloadcms/plugin-sentry/client#AdminErrorBoundary']));
    expect(config.hooks?.afterError).toHaveLength(2);
  });

  it('boots stripe and preserves app endpoints, fields, and hooks', async () => {
    const appHook = vi.fn();
    const appEndpoint = { handler: vi.fn(), method: 'get' as const, path: '/app' };
    const config = await payloadConfig(baseConfig({
      collections: [{ slug: 'products', fields: [{ name: 'name', type: 'text' }], hooks: { beforeChange: [appHook] } }],
      endpoints: [appEndpoint],
      plugins: [stripePlugin({
        stripeSecretKey: 'sk_test_example',
        sync: [{ collection: 'products', fields: [{ fieldPath: 'name', stripeProperty: 'name' }], stripeResourceType: 'products', stripeResourceTypeSingular: 'product' }],
      })],
    }));
    const products = config.collections.find(({ slug }) => slug === 'products');

    expect(config.endpoints?.map(({ path }) => path)).toEqual(expect.arrayContaining(['/app', '/stripe/webhooks']));
    expect(products?.fields).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'name' }), expect.objectContaining({ name: 'stripeID' })]));
    expect(products?.hooks?.beforeChange).toContain(appHook);
  });
});
