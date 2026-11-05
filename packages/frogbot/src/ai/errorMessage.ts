import { providerKeyEnvVar, usedCallCredential } from '@frogbotai/gateway';
import { isGatewayError } from '@frogbotai/gateway/errors';
import { APICallError, RetryError } from 'ai';

import { isOverflowError } from '../chat/compaction/overflow.js';
import { pieceInstanceDefinition } from '../pieces/definePiece.js';
import { resolveModel } from './resolve.js';
import type { SanitizedAIConfig } from './types.js';

export type AIErrorMessageProps = {
  error: unknown;
  model?: string;
  config?: SanitizedAIConfig;
};

export function aiErrorMessage({ error, model, config }: AIErrorMessageProps): string | undefined {
  const cause = RetryError.isInstance(error) ? error.lastError : error;

  if (isOverflowError(cause)) {
    return `This chat is too long for ${model ? model : 'the selected model'}.`;
  }

  if (isGatewayError(cause)) return cause.message;

  if (!APICallError.isInstance(cause)) return undefined;

  const { statusCode } = cause;
  const linked = usedCallCredential(cause) ? linkedPiece({ model, config }) : undefined;

  if (linked) {
    const { label, provider } = linked;

    if (statusCode === 401 || statusCode === 403) {
      return `${label} rejected your API key. Update it in Settings → Linked accounts.`;
    }

    if (statusCode === 429 && isInsufficientQuota(cause)) {
      const billing = provider?.billingUrl
        ? `Check billing at ${new URL(provider.billingUrl).host}.`
        : `Check your ${label} billing.`;

      return `Your ${label} account is out of credit. ${billing}`;
    }
  }

  if (statusCode === 401 || statusCode === 403) {
    return `The AI provider rejected the API key. ${keyHint({ model, config })}`;
  }

  if (statusCode === 429) {
    return 'The AI provider is rate limiting requests or your quota is used up. Try again shortly, or check your plan and billing.';
  }

  if (statusCode === 404) {
    return `${model ? `The model ${model}` : 'The selected model'} isn't available from the AI provider. Check the model ID and your provider account.`;
  }

  if (statusCode === undefined) {
    return "FrogBot couldn't reach the AI provider. Check the network connection and try again.";
  }

  if (statusCode >= 500) return 'The AI provider is unavailable right now. Try again in a moment.';

  return 'The AI provider returned an error. Check the terminal for details.';
}

function linkedPiece({ model, config }: Omit<AIErrorMessageProps, 'error'>) {
  const resolved = model && config ? resolveModel(model, config) : model;
  const provider = resolved?.slice(0, Math.max(resolved.indexOf('/'), 0));
  const piece = provider ? config?.linkedProviders?.[provider] : undefined;

  return piece ? pieceInstanceDefinition(piece) : undefined;
}

function isInsufficientQuota(error: APICallError) {
  const detail = (error.data as { error?: { code?: unknown; type?: unknown } } | undefined)?.error;

  return detail?.code === 'insufficient_quota' || detail?.type === 'insufficient_quota';
}

function keyHint({ model, config }: Omit<AIErrorMessageProps, 'error'>) {
  const separator = model?.indexOf('/') ?? -1;
  const provider = separator > 0 ? model!.slice(0, separator) : undefined;

  if (!provider) return "Check your AI provider's API key.";

  const envVar = config?.providers[provider] === true ? providerKeyEnvVar(provider) : undefined;

  return envVar
    ? `Check ${envVar} in .env.`
    : `Check the API key configured for the ${provider} provider.`;
}
