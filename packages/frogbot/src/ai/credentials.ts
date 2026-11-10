import type { CallCredential } from '@frogbotai/gateway';
import { providerCredentialEnvVars, providerKeyEnvVar } from '@frogbotai/gateway';
import { CallCredentialError } from '@frogbotai/gateway/errors';

import { ConnectionError } from '../connections/api.js';
import { pieceInstanceDefinition } from '../pieces/definePiece.js';
import type { PieceInstance } from '../pieces/types.js';
import type { AIOperationContext } from './hooks.js';

function hasKey(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * The gateway `credential` for a provider a `connections` piece links to: the asking user's
 * linked account, else the app key, else a setup error. A linked account that can't be used
 * fails the call and never falls back to the app key.
 */
export function linkedCredential({
  provider,
  piece,
  apiKey,
}: {
  provider: string;
  piece: PieceInstance;
  apiKey?: string;
}): CallCredential {
  const { label, provider: link } = pieceInstanceDefinition(piece);

  if (!link) throw new Error(`[frogbot] Piece '${piece.piece}' does not declare a provider.`);

  const envVar = providerKeyEnvVar(provider);

  const unlinked = () => {
    if (hasKey(apiKey) || (envVar && hasKey(process.env[envVar]))) return undefined;

    throw new CallCredentialError(
      `${label} isn't set up. Add your ${label} key in Settings → Linked accounts.`,
    );
  };

  return async (context, { via }) => {
    const { req } = context as AIOperationContext;

    if (!req?.frogbot) return unlinked();

    let auth: unknown;

    try {
      ({ auth } = await req.frogbot.connections.resolvePieceCredential({ piece, req }));
    } catch (error) {
      if (!(error instanceof ConnectionError)) throw error;

      if (error.code === 'missing') return unlinked();

      throw new CallCredentialError(`Reconnect ${label} in Settings → Linked accounts.`);
    }

    const settings = link.credential({ auth, via });
    const middleware = link.middleware?.({ auth });

    return middleware ? { settings, middleware } : { settings };
  };
}

/**
 * The gateway `credential` for a built-in provider enabled with `true`: its env key, else a
 * setup error naming the env var. The app boots without the key and only AI calls fail.
 * `undefined` for providers whose credentials don't come from an API key.
 */
export function envCredential(provider: string): CallCredential | undefined {
  const forms = providerCredentialEnvVars(provider);

  if (forms.length === 0) return undefined;

  const vars = forms.map((form) => form.join(' and ')).join(', or ');
  const message = `The ${provider} provider has no API key. Set ${vars} in the environment, or set ai.providers.${provider}.apiKey in the FrogBot config.`;

  return () => {
    if (forms.some((form) => form.every((envVar) => hasKey(process.env[envVar])))) {
      return undefined;
    }

    throw new CallCredentialError(message);
  };
}
