import { describe, expect, it, vi } from 'vitest';

import { executeAuthStrategy } from '../../../../packages/frogbot/src/auth/executeAuthStrategy.js';
import type {
  AuthStrategy,
  AuthStrategyResult,
} from '../../../../packages/frogbot/src/auth/types.js';
import type { FrogBot } from '../../../../packages/frogbot/src/frogbot.js';

function makeArgs(strategy: AuthStrategy) {
  const error = vi.fn();

  return {
    collection: 'users',
    strategy,
    frogbot: { logger: { error } } as unknown as FrogBot,
    headers: new Headers(),
    strategyName: strategy.name,
  };
}

describe('executeAuthStrategy', () => {
  it('logs a rejected strategy once and rethrows the same error', async () => {
    const err = new Error('session service down');
    const args = makeArgs({ name: 'broken', authenticate: vi.fn().mockRejectedValue(err) });

    await expect(executeAuthStrategy(args)).rejects.toBe(err);

    expect(args.frogbot.logger.error).toHaveBeenCalledExactlyOnceWith(
      { err },
      "[frogbot] auth strategy 'broken' on 'users' failed",
    );
  });

  it('logs a synchronous throw once and rethrows the same error', async () => {
    const err = new Error('synchronous failure');
    const args = makeArgs({
      name: 'broken',
      authenticate: () => {
        throw err;
      },
    });

    await expect(executeAuthStrategy(args)).rejects.toBe(err);

    expect(args.frogbot.logger.error).toHaveBeenCalledExactlyOnceWith(
      { err },
      "[frogbot] auth strategy 'broken' on 'users' failed",
    );
  });

  it('logs a non-Error throw once and rethrows the original value', async () => {
    const thrown: unknown = 'x';
    const args = makeArgs({
      name: 'broken',
      authenticate: () => {
        throw thrown;
      },
    });

    await expect(executeAuthStrategy(args)).rejects.toBe('x');

    expect(args.frogbot.logger.error).toHaveBeenCalledExactlyOnceWith(
      { err: 'x' },
      "[frogbot] auth strategy 'broken' on 'users' failed",
    );
  });

  it('returns the successful result unchanged without logging', async () => {
    const result: AuthStrategyResult = {
      user: { id: 'user-1', collection: 'users' },
      responseHeaders: new Headers({ 'x-strategy': 'custom' }),
    };

    const authenticate = vi.fn(() => result);
    const args = makeArgs({ name: 'custom', authenticate });

    const actual = await executeAuthStrategy(args);

    expect(actual).toBe(result);
    expect(authenticate).toHaveBeenCalledExactlyOnceWith({
      canSetHeaders: undefined,
      frogbot: args.frogbot,
      headers: args.headers,
      isGraphQL: undefined,
      req: undefined,
      strategyName: 'custom',
    });
    expect(args.frogbot.logger.error).not.toHaveBeenCalled();
  });
});
