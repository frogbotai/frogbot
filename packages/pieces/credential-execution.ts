import { expect, it, vi } from 'vitest';

export function credentialExecution({
  module,
  piece,
  service,
  credential,
}: {
  module: Record<string, unknown>;
  piece: {
    tools: () => {
      slug: string;
      execute: (input: Record<string, unknown>, ctx: never) => Promise<unknown>;
    }[];
  };
  service: string;
  credential: unknown;
}): void {
  it('requires a native piece for user connections without resolving credentials or running the action', async () => {
    const activepiecesPiece = Object.values(module).find(
      (value) => typeof value === 'object' && value !== null && 'getAction' in value,
    ) as {
      getAction: (name: string) => { run: (context: Record<string, unknown>) => Promise<unknown> };
    };
    const tool = piece.tools().at(0)!;
    const action = activepiecesPiece.getAction(tool.slug.slice(service.length + 1));
    const run = action.run;
    action.run = vi.fn(async ({ auth }) => ({ auth }));
    const resolve = vi.fn().mockResolvedValue(credential);

    try {
      await expect(
        tool.execute({}, {
          req: { user: { id: 'owner' } },
          frogbot: { connections: { resolve } },
        } as never),
      ).resolves.toEqual({
        code: 'missing',
        error: `User connections for legacy piece '${service}' require a native piece instance.`,
      });
      expect(resolve).not.toHaveBeenCalled();
      expect(action.run).not.toHaveBeenCalled();
      await expect(
        tool.execute({}, {
          req: { user: null },
          frogbot: { connections: { resolve } },
        } as never),
      ).resolves.toEqual({
        code: 'unauthenticated',
        error: `Authentication is required to use '${service}'.`,
      });
      expect(resolve).not.toHaveBeenCalled();
      expect(action.run).not.toHaveBeenCalled();
    } finally {
      action.run = run;
    }
  });
}
