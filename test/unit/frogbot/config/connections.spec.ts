import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { COLLECTION_MARKERS } from '../../../../packages/frogbot/src/collections/config/types.js';
import { sanitize } from '../../../../packages/frogbot/src/config/sanitize.js';
import type { FrogBotConfig } from '../../../../packages/frogbot/src/config/types.js';
import type { ConnectionEntry } from '../../../../packages/frogbot/src/connections/types.js';
import { definePiece } from '../../../../packages/frogbot/src/pieces/definePiece.js';
import type { PieceInstance } from '../../../../packages/frogbot/src/pieces/types.js';

const oauth = { clientId: 'client', clientSecret: 'app-secret' };
const auth = { apiKey: 'developer-secret' };
const createPiece = definePiece({
  slug: 'example',
  label: 'Example',
  auth: z.object({ apiKey: z.string().min(1) }),
  client: ({ auth }: { auth: unknown }) => auth,
  oauth: {
    authorizationUrl: 'https://example.com/authorize',
    tokenUrl: 'https://example.com/token',
    scopes: ['read'],
  },
  actions: [
    {
      slug: 'read',
      description: 'Read an item',
      input: z.object({}),
      run: ({ client }) => Promise.resolve(client),
    },
  ],
  webhook: { verify: () => Promise.resolve(true) },
  triggers: [
    {
      type: 'app',
      slug: 'changed',
      description: 'An item changed',
      input: z.object({}),
      event: 'changed',
      run: () => Promise.resolve([]),
    },
  ],
});

function config(overrides: Partial<FrogBotConfig> = {}): FrogBotConfig {
  return {
    secret: 'boot-secret',
    db: {} as FrogBotConfig['db'],
    collections: [{ slug: 'users', auth: true, fields: [] }],
    ...overrides,
  };
}

describe('connection config boot', () => {
  type Combination = { secret: boolean; oauth: boolean };

  async function boot(combination: Combination, connections: ConnectionEntry[]) {
    const enabled = combination.secret || combination.oauth;
    const result = sanitize(config({ connections }));
    const payload = await result._internal.payloadConfig;
    expect(result.connections.enabled).toBe(enabled);
    expect(payload.collections.filter(({ slug }) => slug === 'connections')).toHaveLength(
      enabled ? 1 : 0,
    );
    expect(result.collections.some(({ slug }) => slug === 'connections')).toBe(enabled);
    expect(result.connections).not.toHaveProperty('sources');
    expect(result.connections).not.toHaveProperty('assignments');
    expect(payload).not.toHaveProperty('connections');
    expect(payload).not.toHaveProperty('credentialSources');
    expect(payload.endpoints.some(({ path }) => path.startsWith('/connections'))).toBe(false);

    return { payload, result };
  }

  const slug = 'custom-instance';

  it('boots credential combination A through collection sanitization', async () => {
    const { result } = await boot({ secret: false, oauth: false }, []);

    expect(result.connections.entries).toEqual({});
  });

  it.each<
    Combination & {
      name: string;
      connect: () => { piece: PieceInstance; connections: ConnectionEntry[] };
    }
  >([
    {
      name: 'B',
      secret: true,
      oauth: false,
      connect: () => {
        const piece = createPiece({ slug });
        return { piece, connections: [{ piece, secret: true }] };
      },
    },
    {
      name: 'C',
      secret: false,
      oauth: true,
      connect: () => {
        const piece = createPiece({ slug, oauth });
        return { piece, connections: [{ piece, oauth: true }] };
      },
    },
    {
      name: 'A+B',
      secret: true,
      oauth: false,
      connect: () => {
        const piece = createPiece({ slug, auth });
        return { piece, connections: [{ piece, secret: true }] };
      },
    },
    {
      name: 'A+C',
      secret: false,
      oauth: true,
      connect: () => {
        const piece = createPiece({ slug, auth, oauth });
        return { piece, connections: [{ piece, oauth: true }] };
      },
    },
    {
      name: 'B+C',
      secret: true,
      oauth: true,
      connect: () => {
        const piece = createPiece({ slug, oauth });
        return { piece, connections: [{ piece, secret: true, oauth: true }] };
      },
    },
    {
      name: 'A+B+C',
      secret: true,
      oauth: true,
      connect: () => {
        const piece = createPiece({ slug, auth, oauth });
        return { piece, connections: [{ piece, secret: true, oauth: true }] };
      },
    },
  ])('boots credential combination $name through collection sanitization', async (combination) => {
    const { piece, connections } = combination.connect();
    const { payload, result } = await boot(combination, connections);

    expect(payload.collections.find(({ slug }) => slug === 'connections')?.endpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'post', path: '/:piece' }),
        expect.objectContaining({ method: 'delete', path: '/:id' }),
      ]),
    );
    const entry = result.connections.entries.example;
    expect(entry?.piece).toBe(piece);
    expect(entry).toMatchObject({ secret: combination.secret, oauth: combination.oauth });
    expect(JSON.stringify(entry?.secretSchema ?? {})).not.toContain('developer-secret');
    expect(Boolean(entry?.secretSchema)).toBe(combination.secret);
    const owner = payload.collections
      .find(({ slug }) => slug === 'connections')
      ?.fields.find((field) => 'name' in field && field.name === 'owner');
    expect(owner).toMatchObject({ relationTo: 'users' });
  });

  it('discovers connection-only instances without altering native tools or ingress', async () => {
    const linked = createPiece({ oauth, slug: 'linked' });
    const mounted = createPiece({ auth, slug: 'mounted' });
    const result = sanitize(
      config({
        ai: { providers: { openai: true }, defaultModel: 'openai/gpt-4o' },
        connections: [{ piece: linked, oauth: true }],
        agents: [
          {
            slug: 'assistant',
            instructions: 'Help',
            tools: [mounted],
            triggers: [{ trigger: mounted.triggers.changed, input: {}, handler: () => {} }],
          },
        ],
      }),
    );
    const payload = await result._internal.payloadConfig;
    expect(result.pieces.instances).toEqual(expect.arrayContaining([linked, mounted]));
    expect(result.pieces.instances.filter((instance) => instance === linked)).toHaveLength(1);
    expect(result.agents?.[0]?.tools?.map(({ slug }) => slug)).toEqual(['mounted_read']);
    expect(Object.keys(result._internal.triggers)).toEqual(['mounted']);
    expect(result._internal.triggers.mounted?.instance).toBe(mounted);
    expect(payload.endpoints).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: '/webhooks/:instance' })]),
    );
  });

  it.each([undefined, []])('keeps linking disabled without entries %j', async (connections) => {
    const result = sanitize(config({ connections }));
    const payload = await result._internal.payloadConfig;
    expect(result.connections.enabled).toBe(false);
    expect(payload.collections.some(({ slug }) => slug === 'connections')).toBe(false);
  });

  it.each([
    { connections: {} },
    { connections: { encryption: {} } },
    { connections: { assignments: {} } },
    { connections: null },
  ])('rejects non-array configuration %j', (overrides) => {
    expect(() => sanitize(config(overrides as never))).toThrow('`connections` must be an array');
  });

  it.each([null, {}, { piece: {} }, { piece: createPiece() }])(
    'rejects invalid entries at boot %#',
    (entry) => {
      expect(() => sanitize(config({ connections: [entry as ConnectionEntry] }))).toThrow(
        entry && 'piece' in entry && entry.piece && 'client' in entry.piece
          ? 'requires oauth: true or secret: true'
          : 'requires a piece instance',
      );
    },
  );

  it.each([false, true])('reserves connections even when enabled is %s', (enabled) => {
    expect(() =>
      sanitize(
        config({
          connections: enabled ? [{ piece: createPiece(), secret: true }] : [],
          collections: [{ slug: 'connections', fields: [] }],
        }),
      ),
    ).toThrow("Collection slug 'connections' is reserved");
  });

  it('rejects the removed adoption and source configuration', () => {
    expect(COLLECTION_MARKERS).not.toContain('connections');
    expect(() =>
      sanitize(
        config({
          collections: [{ slug: 'accounts', connections: true, fields: [] } as never],
        }),
      ),
    ).toThrow('marker is no longer supported');
    expect(() => sanitize(config({ credentialSources: [] } as never))).toThrow(
      '`credentialSources` is no longer supported',
    );
  });

  it('rejects duplicate canonical pieces through the full config path', () => {
    expect(() =>
      sanitize(
        config({
          connections: [
            { piece: createPiece({ slug: 'work' }), secret: true },
            { piece: createPiece({ slug: 'personal' }), secret: true },
          ],
        }),
      ),
    ).toThrow("Duplicate connection entry for piece 'example'");
  });

  it('validates each enabled capability through the full config path', () => {
    expect(() =>
      // @ts-expect-error OAuth on a piece without factory OAuth must be rejected at runtime
      sanitize(config({ connections: [{ piece: createPiece(), oauth: true }] })),
    ).toThrow('requires factory OAuth clientId and clientSecret');
    const opaque = definePiece({
      slug: 'opaque',
      label: 'Opaque',
      auth: z.custom(),
      client: ({ auth }: { auth: unknown }) => auth,
      oauth: {
        authorizationUrl: 'https://example.com/authorize',
        tokenUrl: 'https://example.com/token',
        scopes: [],
      },
      actions: [],
    })({ oauth });
    expect(() =>
      sanitize(config({ connections: [{ piece: opaque, oauth: true, secret: true }] })),
    ).toThrow('requires a user-enterable static credential schema');
  });
});
