import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import type { CollectionConfig } from '../../../../packages/frogbot/src/collections/config/types.js';
import type { FrogbotConfig } from '../../../../packages/frogbot/src/config/types.js';
import {
  DEFAULT_CONNECTIONS_SLUG,
  resolveConnectionsCollections,
} from '../../../../packages/frogbot/src/connections/resolveCollections.js';
import type { ConnectionEntry } from '../../../../packages/frogbot/src/connections/types.js';
import { definePiece } from '../../../../packages/frogbot/src/pieces/definePiece.js';

const oauth = { clientId: 'client', clientSecret: 'secret' };
const createPiece = definePiece({
  slug: 'linear',
  label: 'Linear',
  auth: z.object({ apiKey: z.string().min(1) }),
  client: ({ auth }) => auth,
  oauth: {
    authorizationUrl: 'https://example.com/authorize',
    tokenUrl: 'https://example.com/token',
    scopes: [],
  },
  actions: [],
});

function config({
  collections = [],
  connections = [{ piece: createPiece(), secret: true }],
}: {
  collections?: CollectionConfig[];
  connections?: ConnectionEntry[];
} = {}): FrogbotConfig {
  return {
    secret: 'secret',
    db: {} as FrogbotConfig['db'],
    collections: [{ slug: 'users', auth: true, fields: [] }, ...collections],
    connections,
  };
}

describe('resolveConnectionsCollections', () => {
  it('injects the default collection for explicit connection entries', () => {
    const result = resolveConnectionsCollections(config());
    expect(result.connections).toMatchObject({ enabled: true, slug: DEFAULT_CONNECTIONS_SLUG });
    expect(result.collections.map((collection) => collection.slug)).toEqual([
      'users',
      'connections',
    ]);
  });

  it('does not inject a collection for an empty list', () => {
    const input = config({ connections: [] });
    const result = resolveConnectionsCollections(input);
    expect(result.connections).toMatchObject({ enabled: false, entries: {} });
    expect(result.connections.slug).toBeUndefined();
    expect(result.collections).toBe(input.collections);
  });

  it.each([false, true])('reserves the slug when enabled is %s', (enabled) => {
    expect(() =>
      resolveConnectionsCollections(
        config({
          collections: [{ slug: 'connections', fields: [] }],
          connections: enabled ? [{ piece: createPiece(), secret: true }] : [],
        }),
      ),
    ).toThrow("Collection slug 'connections' is reserved");
  });

  it('rejects adoption markers', () => {
    expect(() =>
      resolveConnectionsCollections(
        config({
          collections: [{ slug: 'accounts', connections: true, fields: [] } as CollectionConfig],
        }),
      ),
    ).toThrow('marker is no longer supported');
  });

  it.each([{ oauth: true }, { secret: true }, { oauth: true, secret: true }])(
    'normalizes enabled methods %j',
    (methods) => {
      const piece = createPiece({ oauth, slug: 'custom-linear' });
      const { connections } = resolveConnectionsCollections(
        config({ connections: [{ piece, ...methods }] }),
      );
      expect(Object.keys(connections.entries)).toEqual(['linear']);
      expect(connections.entries.linear).toMatchObject({
        piece,
        oauth: methods.oauth === true,
        secret: methods.secret === true,
      });
      expect(connections.entries.linear?.piece).toBe(piece);
      expect(connections.entries.toString).toBeUndefined();
    },
  );

  it.each([{}, { oauth: false }, { secret: false }, { oauth: false, secret: false }])(
    'rejects entries with neither method %j',
    (methods) => {
      expect(() =>
        resolveConnectionsCollections(
          config({
            connections: [{ piece: createPiece({ oauth }), ...methods }],
          }),
        ),
      ).toThrow('requires oauth: true or secret: true');
    },
  );

  it.each(['oauth', 'secret'] as const)('rejects non-boolean %s permission', (method) => {
    expect(() =>
      resolveConnectionsCollections(
        config({
          connections: [
            { piece: createPiece({ oauth }), secret: true, [method]: 'true' } as ConnectionEntry,
          ],
        }),
      ),
    ).toThrow(`${method} must be a boolean`);
  });

  it('requires factory OAuth credentials for an enabled OAuth method', () => {
    expect(() =>
      resolveConnectionsCollections(
        config({
          connections: [{ piece: createPiece(), oauth: true }],
        }),
      ),
    ).toThrow('requires factory OAuth clientId and clientSecret');
  });

  it('requires a recipe independently of the OAuth app', () => {
    const piece = definePiece({
      slug: 'static',
      label: 'Static',
      auth: z.string(),
      client: ({ auth }) => auth,
      actions: [],
    })();
    piece.oauth = oauth;
    expect(() =>
      resolveConnectionsCollections(
        config({
          connections: [{ piece, oauth: true, secret: true }],
        }),
      ),
    ).toThrow("requires the piece's OAuth recipe");
  });

  it.each([
    z.unknown(),
    z.custom(),
    z.object({}),
    z.object({ key: z.unknown() }),
    z.record(z.string(), z.string()),
    z.union([z.string(), z.object({ key: z.string() })]),
  ])('rejects an unrenderable auth schema %#', (auth) => {
    const piece = definePiece({
      slug: 'static',
      label: 'Static',
      auth,
      client: ({ auth }) => auth,
      actions: [],
    })();
    expect(() =>
      resolveConnectionsCollections(
        config({
          connections: [{ piece, secret: true }],
        }),
      ),
    ).toThrow('requires a user-enterable static credential schema');
  });

  it('rejects secret linking on an authless piece', () => {
    const piece = definePiece({ slug: 'public', label: 'Public', actions: [] })();
    expect(() =>
      resolveConnectionsCollections(
        config({
          connections: [{ piece, secret: true }],
        }),
      ),
    ).toThrow('requires a user-enterable static credential schema');
  });

  it('exposes the input form schema while retaining validation on the piece', () => {
    const auth = z.object({
      key: z
        .string()
        .min(1)
        .transform((key) => key.trim()),
      region: z.enum(['us', 'eu']).optional(),
      settings: z.object({ enabled: z.boolean(), count: z.number() }),
      scopes: z.array(z.string()),
      label: z.string().nullable(),
    });
    const piece = definePiece({
      slug: 'static',
      label: 'Static',
      auth,
      client: ({ auth }) => auth,
      actions: [],
    })();
    const { connections } = resolveConnectionsCollections(
      config({ connections: [{ piece, secret: true }] }),
    );
    expect(connections.entries.static?.secretSchema).toMatchObject({
      type: 'object',
      properties: { key: { type: 'string', minLength: 1 }, region: { enum: ['us', 'eu'] } },
      required: ['key', 'settings', 'scopes', 'label'],
    });
  });

  it('rejects duplicate canonical pieces even with distinct instance slugs', () => {
    expect(() =>
      resolveConnectionsCollections(
        config({
          connections: [
            { piece: createPiece({ slug: 'work' }), secret: true },
            { piece: createPiece({ slug: 'personal', oauth }), oauth: true },
          ],
        }),
      ),
    ).toThrow("Duplicate connection entry for piece 'linear'");
  });

  it('derives encryption from the FrogBot secret', async () => {
    const first = resolveConnectionsCollections(config()).connections.encryption;
    const second = resolveConnectionsCollections(config()).connections.encryption;
    const ciphertext = await first.encrypt('private');
    expect(ciphertext).not.toContain('private');
    expect(await second.decrypt(ciphertext)).toBe('private');
  });

  it('owner-scopes reads and hides encrypted credentials', async () => {
    const result = resolveConnectionsCollections(config());
    const collection = result.collections.find((item) => item.slug === 'connections')!;
    const read = collection.access!.read!;
    expect(await read({ req: { user: { id: 'owner', collection: 'users' } } as never })).toEqual({
      owner: { equals: 'owner' },
    });
    expect(await read({ req: { user: null } as never })).toBe(false);
    expect(await read({ req: { user: { id: 'owner', collection: 'customers' } } as never })).toBe(
      false,
    );
    const encrypted = collection.fields.find(
      (field) => 'name' in field && field.name === 'credential',
    );
    expect(encrypted).toMatchObject({ hidden: true, access: { read: expect.any(Function) } });
    expect(await (encrypted as { access: { read: () => boolean } }).access.read()).toBe(false);
  });

  it('requires an encrypted credential and a unique owner/piece pair', () => {
    const result = resolveConnectionsCollections(config());
    const collection = result.collections.find((item) => item.slug === 'connections')!;
    const field = collection.fields.find((item) => 'name' in item && item.name === 'credential');
    expect(field).toMatchObject({ type: 'text', required: true });
    expect(collection.indexes).toEqual([{ fields: ['owner', 'piece'], unique: true }]);
  });
});
