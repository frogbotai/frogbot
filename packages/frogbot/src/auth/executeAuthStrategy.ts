import type { AuthStrategy, AuthStrategyFunctionArgs, AuthStrategyResult } from './types.js';

export async function executeAuthStrategy({
  collection,
  strategy,
  canSetHeaders,
  frogbot,
  headers,
  isGraphQL,
  req,
  strategyName,
}: {
  collection: string;
  strategy: AuthStrategy;
} & AuthStrategyFunctionArgs): Promise<AuthStrategyResult> {
  try {
    return await strategy.authenticate({
      canSetHeaders,
      frogbot,
      headers,
      isGraphQL,
      req,
      strategyName,
    });
  } catch (err) {
    frogbot.logger.error(
      { err },
      `[frogbot] auth strategy '${strategy.name}' on '${collection}' failed`,
    );

    throw err;
  }
}
