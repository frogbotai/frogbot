import { z } from 'zod';

import { frogbotError } from '../../errors/catalog.js';
import type { PieceOAuthRecipe } from '../../pieces/types.js';

const httpURL = z.url({ protocol: /^https?$/ });

const metadataSchema = z.object({
  issuer: z.string(),
  authorization_endpoint: httpURL,
  token_endpoint: httpURL,
  userinfo_endpoint: httpURL.optional(),
  end_session_endpoint: httpURL.optional(),
});

/** The parts of an OpenID Connect discovery document FrogBot reads. */
export type OidcMetadata = z.infer<typeof metadataSchema>;

const lifetime = 60 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; metadata: Promise<OidcMetadata> }>();

async function fetchMetadata(issuer: string): Promise<OidcMetadata> {
  const url = `${issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`;

  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) throw new Error(`${url} answered ${response.status}.`);
    const metadata = metadataSchema.parse(await response.json());
    if (metadata.issuer !== issuer) {
      throw new Error(`${url} names issuer ${metadata.issuer}, not ${issuer}.`);
    }

    return metadata;
  } catch (cause) {
    throw frogbotError('oauth.configuration', {
      detail: `The OpenID Connect discovery document for ${issuer} couldn't be read.`,
      cause,
    });
  }
}

/**
 * Reads an OpenID Connect issuer's discovery document, checking that it names the same issuer.
 * Results are kept for an hour; a failed read is retried on the next call.
 */
export function discoverOidc(issuer: string): Promise<OidcMetadata> {
  const cached = cache.get(issuer);
  if (cached && cached.expiresAt > Date.now()) return cached.metadata;

  const metadata = fetchMetadata(issuer);
  cache.set(issuer, { expiresAt: Date.now() + lifetime, metadata });

  metadata.catch(() => {
    if (cache.get(issuer)?.metadata === metadata) cache.delete(issuer);
  });

  return metadata;
}

/** A redirect-flow recipe's authorization and token URLs, discovered from `issuer` when it has one. */
export async function oauthEndpoints(
  recipe: PieceOAuthRecipe<unknown, unknown>,
): Promise<{ authorizationUrl: string; tokenUrl: string }> {
  if (recipe.issuer === undefined) {
    return { authorizationUrl: recipe.authorizationUrl, tokenUrl: recipe.tokenUrl };
  }

  const metadata = await discoverOidc(recipe.issuer);

  return { authorizationUrl: metadata.authorization_endpoint, tokenUrl: metadata.token_endpoint };
}
