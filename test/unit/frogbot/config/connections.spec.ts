import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { COLLECTION_MARKERS } from '../../../../packages/frogbot/src/collections/config/types.js';
import { sanitize } from '../../../../packages/frogbot/src/config/sanitize.js';
import type { FrogbotConfig } from '../../../../packages/frogbot/src/config/types.js';
import type { ConnectionEntry } from '../../../../packages/frogbot/src/connections/types.js';
import { definePiece } from '../../../../packages/frogbot/src/pieces/definePiece.js';

const oauth = { clientId: 'client', clientSecret: 'app-secret' };
const auth = { apiKey: 'developer-secret' };
const createPiece = definePiece({
  slug: 'example',
  label: 'Example',
  auth: z.object({ apiKey: z.string().min(1) }),
  client: ({ auth }) => auth,
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
      run: async ({ client }) => client,
    },
  ],
  webhook: { verify: async () => true },
  triggers: [
    {
      type: 'app',
      slug: 'changed',
      description: 'An item changed',
      input: z.object({}),
      event: 'changed',
      run: async () => [],
    },
  ],
});

function config(overrides: Partial<FrogbotConfig> = {}): FrogbotConfig {
  return {
    secret: 'boot-secret',
    db: {} as FrogbotConfig['db'],
    collections: [{ slug: 'users', auth: true, fields: [] }],
    ...overrides,
  };
}

describe('connection config boot', () => {
  it.each([
    { name: 'A', developer: true, secret: false, oauth: false },
    { name: 'B', developer: false, secret: true, oauth: false },
    { name: 'C', developer: false, secret: false, oauth: true },
    { name: 'A+B', developer: true, secret: true, oauth: false },
    { name: 'A+C', developer: true, secret: false, oauth: true },
    { name: 'B+C', developer: false, secret: true, oauth: true },
    { name: 'A+B+C', developer: true, secret: true, oauth: true },
  ])('boots credential combination $name through collection sanitization', async (combination) => {
    const piece = createPiece({
      slug: 'custom-instance',
      ...(combination.developer ? { auth } : {}),
      ...(combination.oauth ? { oauth } : {}),
    });
    const enabled = combination.secret || combination.oauth;
    const result = sanitize(
      config({
        pieces: [piece],
        connections: enabled
          ? [{ piece, secret: combination.secret, oauth: combination.oauth }]
          : [],
      }),
    );
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
    if (enabled) {
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
    } else {
      expect(result.connections.entries).toEqual({});
    }
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
            triggers: [{ trigger: mounted.triggers.changed, input: {}, prompt: 'Handle change' }],
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
    const result = sanitize(
      config({
        connections,
        pieces: [createPiece({ auth, slug: 'unused' })],
      }),
    );
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
      sanitize(config({ connections: [{ piece: createPiece(), oauth: true }] })),
    ).toThrow('requires factory OAuth clientId and clientSecret');
    const opaque = definePiece({
      slug: 'opaque',
      label: 'Opaque',
      auth: z.custom(),
      client: ({ auth }) => auth,
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
