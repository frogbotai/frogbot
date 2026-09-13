import { describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { resolveConnectionsCollections } from '../../../packages/frogbot/src/connections/resolveCollections.js';
import { pieceFactoryDefinition } from '../../../packages/frogbot/src/pieces/definePiece.js';
import { createLinear } from '../../../packages/pieces/piece-linear/src/index.js';

describe('Linear connections', () => {
  it('enables the existing API-key credential form without an OAuth application', () => {
    const linear = createLinear();
    const { connections } = resolveConnectionsCollections({
      db: {} as never,
      secret: 'test-secret',
      collections: [{ slug: 'users', auth: true, fields: [] }],
      connections: [{ piece: linear, secret: true }],
    });
    expect(connections.entries.linear).toMatchObject({
      piece: linear,
      oauth: false,
      secret: true,
      secretSchema: {
        type: 'object',
        required: ['apiKey'],
        properties: { apiKey: { type: 'string', minLength: 1, secret: true } },
      },
    });
    const recipe = pieceFactoryDefinition(createLinear);
    expect(recipe.oauth).toBeUndefined();
    expect(recipe.auth?.safeParse({ apiKey: '' }).success).toBe(false);
    expect(recipe.auth?.safeParse({ apiKey: 'lin_api_test' }).success).toBe(true);
  });

  it('rejects OAuth linking rather than guessing an unsupported provider recipe', () => {
    expect(() =>
      resolveConnectionsCollections({
        secret: 'test-secret',
        collections: [{ slug: 'users', auth: true, fields: [] }],
        connections: [{ piece: createLinear(), oauth: true }],
      } as never),
    ).toThrow("Connection 'linear' requires the piece's OAuth recipe.");
  });
});
