import { describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { resolveConnectionsCollections } from '../../../packages/frogbot/src/connections/resolveCollections.js';
import { pieceInstanceRuntime } from '../../../packages/frogbot/src/pieces/definePiece.js';
import {
  connectionInput,
  initialConnectionValue,
  projectConnectionSchema,
} from '../../../packages/next/src/views/Connections/schema.js';
import { createGithub } from '../../../packages/pieces/piece-github/src/index.js';
import { createLinear } from '../../../packages/pieces/piece-linear/src/index.js';

describe('Channel credential forms', () => {
  it.each([
    {
      piece: createGithub(),
      input: { accessToken: 'user-token' },
      expected: { accessToken: 'user-token' },
    },
    {
      piece: createGithub(),
      input: { appId: '123', privateKey: 'app-key', installationId: '456' },
      expected: { appId: '123', privateKey: 'app-key', installationId: 456 },
    },
    {
      piece: createLinear(),
      input: { apiKey: 'lin_api_key' },
      expected: { apiKey: 'lin_api_key' },
    },
    {
      piece: createLinear(),
      input: { accessToken: 'oauth-token' },
      expected: { accessToken: 'oauth-token' },
    },
  ])('projects and submits $piece.slug credentials $input', ({ piece, input, expected }) => {
    const { connections } = resolveConnectionsCollections({
      db: {} as never,
      secret: 'test-secret',
      collections: [{ slug: 'users', auth: true, fields: [] }],
      connections: [{ piece, secret: true }],
    });

    const entry = connections.entries[piece.slug]!;
    const field = projectConnectionSchema(entry.secretSchema);
    const initial = initialConnectionValue(field);

    expect(initial).toEqual({});

    const submitted = connectionInput({ field, value: { ...(initial as object), ...input } });
    const auth = pieceInstanceRuntime(piece).definition.auth!;

    expect(auth.parse(submitted)).toEqual(expected);
    expect(auth.safeParse(initial).success).toBe(false);
  });
});
