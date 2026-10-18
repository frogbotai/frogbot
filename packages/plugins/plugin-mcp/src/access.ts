import type { AuthorizedMCP, SanitizedMCPPluginConfig } from '@payloadcms/plugin-mcp';
import { filterMCPItems } from '@payloadcms/plugin-mcp/internal';
import type { AuthStrategy, AuthStrategyResult } from 'frogbot';
import {
  attachRegisteredFrogBot,
  executeAuthStrategy,
  isInternalCollection,
} from 'frogbot/internal';
import type { PayloadRequest } from 'payload';
import { UnauthorizedError } from 'payload';

type AuthorizeMcpOptions = {
  collection: string;
  strategy: AuthStrategy;
  pluginConfig: SanitizedMCPPluginConfig;
  req: PayloadRequest;
};

/**
 * Signs the request in with a FrogBot API key and returns the MCP items the key's user can reach,
 * without FrogBot's own collections. Access is always enforced, whatever the request asks.
 */
export async function authorizeMcp({
  collection,
  strategy,
  pluginConfig,
  req,
}: AuthorizeMcpOptions): Promise<AuthorizedMCP> {
  const frogbotReq = attachRegisteredFrogBot(req);
  let result: AuthStrategyResult;

  try {
    result = await executeAuthStrategy({
      collection,
      strategy,
      frogbot: frogbotReq.frogbot,
      headers: req.headers,
      req: frogbotReq,
      strategyName: strategy.name,
    });
  } catch {
    throw new UnauthorizedError();
  }

  if (!result.user) throw new UnauthorizedError();

  req.user = { ...result.user, collection: result.user.collection ?? collection };

  const internal = new Set(
    req.payload.config.collections.filter(isInternalCollection).map(({ slug }) => slug),
  );

  const items = await filterMCPItems({
    items: pluginConfig.items.filter(
      (item) => item.type !== 'collectionTool' || !internal.has(item.collectionSlug),
    ),
    overrideAccess: false,
    req,
  });

  return { items, overrideAccess: false };
}
