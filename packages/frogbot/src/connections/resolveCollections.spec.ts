import { describe, expect, it } from 'vitest';

import type { CollectionConfig } from '../types/collection.js';
import type { FrogbotConfig } from '../types/config.js';
import type { SanitizedPiecesConfig } from '../types/piece.js';
import { DEFAULT_CONNECTIONS_SLUG, resolveConnectionsCollections } from './resolveCollections.js';

const pieces = {
  enabled: true,
  pieces: [{ service: 'linear', credentialType: 'secret_text', actions: [], tools: () => [] }],
  services: {},
  tools: {},
} as SanitizedPiecesConfig;

function config(collections: CollectionConfig[] = []): FrogbotConfig {
  return {
    secret: 'secret',
    db: {} as FrogbotConfig['db'],
    collections: [{ slug: 'users', auth: true, fields: [] }, ...collections],
  };
}

describe('resolveConnectionsCollections', () => {
  it('injects the default collection for credentialed pieces', () => {
    const result = resolveConnectionsCollections(config(), pieces);
    expect(result.connections).toMatchObject({ enabled: true, slug: DEFAULT_CONNECTIONS_SLUG });
    expect(result.collections.map((collection) => collection.slug)).toEqual(['users', 'connections']);
  });

  it('adopts and extends a marked collection', () => {
    const result = resolveConnectionsCollections(
      config([{ slug: 'accounts', connections: true, fields: [{ name: 'tenant', type: 'text' }] }]),
      pieces,
    );
    const collection = result.collections.find((item) => item.slug === 'accounts');
    expect(result.connections.slug).toBe('accounts');
    expect(collection?.fields.map((field) => 'name' in field ? field.name : undefined)).toContain('tenant');
    expect(collection?.fields.map((field) => 'name' in field ? field.name : undefined)).toContain('encryptedCredentials');
  });

  it('rejects collisions and duplicate markers', () => {
    expect(() => resolveConnectionsCollections(config([{ slug: 'connections', fields: [] }]), pieces)).toThrow('Add `connections: true`');
    expect(() => resolveConnectionsCollections(config([
      { slug: 'one', connections: true, fields: [] },
      { slug: 'two', connections: true, fields: [] },
    ]), pieces)).toThrow('Multiple collections marked `connections: true`');
  });

  it('rejects reserved fields and locks metadata to json', () => {
    expect(() => resolveConnectionsCollections(config([
      { slug: 'accounts', connections: true, fields: [{ name: 'owner', type: 'text' }] },
    ]), pieces)).toThrow("Field 'owner'");
    expect(() => resolveConnectionsCollections(config([
      { slug: 'accounts', connections: true, fields: [{ name: 'metadata', type: 'text' }] },
    ]), pieces)).toThrow("must use type 'json'");
  });

  it('owner-scopes reads and hides encrypted credentials', async () => {
    const result = resolveConnectionsCollections(config(), pieces);
    const collection = result.collections.find((item) => item.slug === 'connections')!;
    const read = collection.access?.read!;
    expect(await read({ req: { user: { id: 'owner' } } as never })).toEqual({ owner: { equals: 'owner' } });
    expect(await read({ req: { user: null } as never })).toBe(false);
    const encrypted = collection.fields.find((field) => 'name' in field && field.name === 'encryptedCredentials');
    expect(encrypted).toMatchObject({ hidden: true, access: { read: expect.any(Function) } });
    expect(await (encrypted as { access: { read: () => boolean } }).access.read()).toBe(false);
  });
});
