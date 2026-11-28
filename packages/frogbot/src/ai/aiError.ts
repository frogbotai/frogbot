import { providerKeyEnvVar, usedCallCredential } from '@frogbotai/gateway';
import { APICallError, RetryError } from 'ai';

import { isOverflowError } from '../chat/compaction/overflow.js';
import { frogbotError, type FrogBotErrorCode } from '../errors/catalog.js';
import type { FrogBotError } from '../errors/FrogBotError.js';
import { gatewayFrogBotError, isGatewayError } from '../errors/gateway.js';
import { pieceInstanceDefinition } from '../pieces/definePiece.js';
import { resolveModel } from './resolve.js';
import type { SanitizedAIConfig } from './types.js';

export type AIErrorProps = {
  error: unknown;
  model?: string;
  config?: SanitizedAIConfig;
};

/** The `FrogBotError` for a failed AI call, or `undefined` when the error didn't come from one. */
export function aiError(props: AIErrorProps): FrogBotError | undefined {
  const { error } = props;
  const cause = RetryError.isInstance(error) ? error.lastError : error;

  if (isGatewayError(cause)) return gatewayFrogBotError(cause);

  const found = providerError({ ...props, error: cause });

  return found && frogbotError(found.code, { detail: found.detail, hint: found.hint, cause });
}

/** The text a person sees in chat for a failed AI call: what went wrong, then what to do. */
export function aiErrorText(props: AIErrorProps): string | undefined {
  const error = aiError(props);

  if (!error) return undefined;

  return isGatewayError(error.cause) ? error.message : `${error.message} ${error.hint}`;
}

type ProviderError = { code: FrogBotErrorCode; detail: string; hint?: string };

function providerError({ error: cause, model, config }: AIErrorProps): ProviderError | undefined {
  if (isOverflowError(cause)) {
    return {
      code: 'ai.context-overflow',
      detail: `This chat is too long for ${model ? model : 'the selected model'}.`,
    };
  }

  if (!APICallError.isInstance(cause)) return undefined;

  const { statusCode } = cause;
  const linked = usedCallCredential(cause) ? linkedPiece({ model, config }) : undefined;

  if (linked) {
    const { label, provider } = linked;

    if (statusCode === 401 || statusCode === 403) {
      return {
        code: 'ai.key-rejected',
        detail: `${label} rejected your API key.`,
        hint: 'Update it in Settings → Linked accounts.',
      };
    }

    if (statusCode === 429 && isInsufficientQuota(cause)) {
      const billing = provider?.billingUrl
        ? `Check billing at ${new URL(provider.billingUrl).host}.`
        : `Check your ${label} billing.`;

      return {
        code: 'ai.out-of-credit',
        detail: `Your ${label} account is out of credit.`,
        hint: billing,
      };
    }
  }

  if (statusCode === 401 || statusCode === 403) {
    return {
      code: 'ai.key-rejected',
      detail: 'The AI provider rejected the API key.',
      hint: keyHint({ model, config }),
    };
  }

  if (statusCode === 429) {
    return {
      code: 'ai.rate-limited',
      detail: 'The AI provider is rate limiting requests or your quota is used up.',
    };
  }

  if (statusCode === 404) {
    return {
      code: 'ai.model-unavailable',
      detail: `${model ? `The model ${model}` : 'The selected model'} isn't available from the AI provider.`,
    };
  }

  if (statusCode === undefined) {
    return { code: 'ai.unreachable', detail: "FrogBot couldn't reach the AI provider." };
  }

  if (statusCode >= 500) {
    return { code: 'ai.provider-down', detail: 'The AI provider is unavailable right now.' };
  }

  return { code: 'ai.provider-error', detail: 'The AI provider returned an error.' };
}

function linkedPiece({ model, config }: Omit<AIErrorProps, 'error'>) {
  const resolved = model && config ? resolveModel(model, config) : model;
  const provider = resolved?.slice(0, Math.max(resolved.indexOf('/'), 0));
  const piece = provider ? config?.linkedProviders?.[provider] : undefined;

  return piece ? pieceInstanceDefinition(piece) : undefined;
}

function isInsufficientQuota(error: APICallError) {
  const detail = (error.data as { error?: { code?: unknown; type?: unknown } } | undefined)?.error;

  return detail?.code === 'insufficient_quota' || detail?.type === 'insufficient_quota';
}

function keyHint({ model, config }: Omit<AIErrorProps, 'error'>) {
  const separator = model?.indexOf('/') ?? -1;
  const provider = separator > 0 ? model!.slice(0, separator) : undefined;

  if (!provider) return "Check your AI provider's API key.";

  const entry = config?.providers[provider];
  const fromEnv =
    entry === true ||
    (typeof entry === 'object' && (!('apiKey' in entry) || entry.apiKey === undefined));

  const envVar = fromEnv ? providerKeyEnvVar(provider) : undefined;

  return envVar
    ? `Check ${envVar} in .env.`
    : `Check the API key configured for the ${provider} provider.`;
}
