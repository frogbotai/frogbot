import { providerKeyEnvVar } from '@frogbotai/gateway';
import { isGatewayError } from '@frogbotai/gateway/errors';
import { APICallError, RetryError } from 'ai';

import type { SanitizedAIConfig } from './types.js';

export type AIErrorMessageProps = {
  error: unknown;
  model?: string;
  config?: SanitizedAIConfig;
};

export function aiErrorMessage({ error, model, config }: AIErrorMessageProps): string | undefined {
  const cause = RetryError.isInstance(error) ? error.lastError : error;

  if (isGatewayError(cause)) return cause.message;

  if (!APICallError.isInstance(cause)) return undefined;

  const { statusCode } = cause;

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

function keyHint({ model, config }: Omit<AIErrorMessageProps, 'error'>) {
  const separator = model?.indexOf('/') ?? -1;
  const provider = separator > 0 ? model!.slice(0, separator) : undefined;

  if (!provider) return "Check your AI provider's API key.";

  const envVar = config?.providers[provider] === true ? providerKeyEnvVar(provider) : undefined;

  return envVar
    ? `Check ${envVar} in .env.`
    : `Check the API key configured for the ${provider} provider.`;
}
