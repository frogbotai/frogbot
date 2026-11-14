import { apiKeyChallenge, apiKeyRefusal } from '@frogbotai/plugin-api-keys';
import type { AuthorizedMCP, SanitizedMCPPluginConfig } from '@payloadcms/plugin-mcp';
import { filterMCPItems } from '@payloadcms/plugin-mcp/internal';
import { APIError, type AuthStrategy, type AuthStrategyResult } from 'frogbot';
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
  resourceMetadataURL?: string;
};

/**
 * Signs the request in with a FrogBot API key, then with the app's own strategies, and returns the
 * MCP items the user can reach, without FrogBot's own collections. Access is always enforced,
 * whatever the request asks.
 */
export async function authorizeMcp({
  collection,
  strategy,
  pluginConfig,
  req,
  resourceMetadataURL,
}: AuthorizeMcpOptions): Promise<AuthorizedMCP> {
  const frogbotReq = attachRegisteredFrogBot(req);
  let user: AuthStrategyResult['user'] = null;

  try {
    ({ user } = await executeAuthStrategy({
      collection,
      strategy,
      frogbot: frogbotReq.frogbot,
      headers: req.headers,
      req: frogbotReq,
      strategyName: strategy.name,
    }));
  } catch {
    user = null;
  }

  if (user) {
    user = { ...user, collection: user.collection ?? collection };
  } else {
    const headers = new Headers(req.headers);

    headers.set('DisableAutologin', 'true');
    ({ user } = await frogbotReq.frogbot.auth({ headers, req: frogbotReq }));
  }

  if (!user) {
    const refusal = apiKeyRefusal(frogbotReq);
    const challenge = [
      resourceMetadataURL && `resource_metadata="${resourceMetadataURL}"`,
      refusal && apiKeyChallenge(refusal),
    ].filter(Boolean);

    if (challenge.length) {
      req.responseHeaders = new Headers(req.responseHeaders);

      req.responseHeaders.set('WWW-Authenticate', `Bearer ${challenge.join(', ')}`);
    }

    throw refusal ? new APIError(refusal, 401, null, true) : new UnauthorizedError();
  }

  req.user = user as PayloadRequest['user'];

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
