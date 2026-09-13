import { describe, expect, it, vi } from 'vitest';

import { createActivepiecesPiece } from '../../../../packages/frogbot/src/exports/pieces.js';

function tool(auth?: { apiKey: string }) {
  const action = {
    name: 'run',
    displayName: 'Run',
    description: 'Run',
    props: {},
    run: vi.fn(async ({ auth }) => auth),
  };
  const module = {
    piece: { metadata: () => ({}), actions: () => ({ run: action }), getAction: () => action },
  };
  return {
    action,
    tool: createActivepiecesPiece({
      module,
      service: 'linear',
      credentialType: 'secret_text',
      defaultActions: ['run'],
      config: auth ? { auth } : undefined,
    }).tools()[0]!,
  };
}

describe('legacy credentialed piece execution', () => {
  it('uses factory credentials without entering the native connections API', async () => {
    const { action, tool: pieceTool } = tool({ apiKey: 'factory' });
    const auth = { type: 'SECRET_TEXT', secret_text: 'factory' };
    await expect(pieceTool.execute({}, { req: { user: null } } as never)).resolves.toEqual(auth);
    expect(action.run).toHaveBeenCalledWith(expect.objectContaining({ auth }));
  });

  it('requires migration to a native piece for per-user credentials', async () => {
    const { action, tool: pieceTool } = tool();
    await expect(pieceTool.execute({}, { req: { user: null } } as never)).resolves.toMatchObject({
      code: 'unauthenticated',
    });
    await expect(
      pieceTool.execute({}, { req: { user: { id: 'owner' } } } as never),
    ).resolves.toEqual({
      error: "User connections for legacy piece 'linear' require a native piece instance.",
      code: 'missing',
    });
    expect(action.run).not.toHaveBeenCalled();
  });
});
