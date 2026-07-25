import { describe, expect, it, vi } from 'vitest';

import { ConnectionError } from '../connections/api.js';
import { createActivepiecesPiece } from '../exports/pieces.js';

function tool() {
  const action = {
    name: 'run',
    displayName: 'Run',
    description: 'Run',
    props: {},
    run: vi.fn(async ({ auth }) => auth),
  };
  const module = {
    piece: {
      metadata: () => ({}),
      actions: () => ({ run: action }),
      getAction: () => action,
    },
  };
  return { action, tool: createActivepiecesPiece({ module, service: 'linear', credentialType: 'secret_text', defaultActions: ['run'] }).tools()[0]! };
}

describe('credentialed piece execution', () => {
  it('passes resolved auth to the action', async () => {
    const { action, tool: pieceTool } = tool();
    const resolve = vi.fn().mockResolvedValue('token');
    await expect(pieceTool.execute({}, { req: { user: { id: 'owner' } }, frogbot: { connections: { resolve } } } as never)).resolves.toBe('token');
    expect(action.run).toHaveBeenCalledWith(expect.objectContaining({ auth: 'token' }));
  });

  it('returns distinct actionable connection results without secrets', async () => {
    const { tool: pieceTool } = tool();
    await expect(pieceTool.execute({}, { req: { user: null } } as never)).resolves.toEqual(expect.objectContaining({ code: 'unauthenticated' }));
    for (const code of ['missing', 'revoked', 'expired'] as const) {
      const resolve = vi.fn().mockRejectedValue(new ConnectionError(`Connection is ${code}.`, code));
      const result = await pieceTool.execute({}, { req: { user: { id: 'owner' } }, frogbot: { connections: { resolve } } } as never);
      expect(result).toEqual({ error: `Connection is ${code}.`, code });
      expect(JSON.stringify(result)).not.toContain('token');
    }
  });
});
