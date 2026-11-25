import {
  type GatewayError,
  type GatewayErrorCode,
  isGatewayError,
} from '@frogbotai/gateway/errors';

import { frogbotError, type FrogBotErrorCode } from './catalog.js';
import type { FrogBotError } from './FrogBotError.js';

const GATEWAY_CODES: Partial<Record<GatewayErrorCode, FrogBotErrorCode>> = {
  budget_exceeded: 'ai.budget-spent',
  credential_unavailable: 'ai.no-credential',
  model_not_allowed: 'agent.model-not-allowed',
  model_not_found: 'ai.model-unavailable',
  rate_limit_exceeded: 'ai.rate-limited',
};

export { isGatewayError };

/**
 * The `FrogBotError` for an AI gateway error: its `ai.*` code, status, message and Retry-After.
 * A gateway failure at 500 or above is `internal`, so its message stays in the log.
 */
export function gatewayFrogBotError(cause: GatewayError): FrogBotError {
  if (cause.status >= 500) return frogbotError('internal', { cause });

  const retryAfter = 'retryAfterSeconds' in cause ? Number(cause.retryAfterSeconds) : undefined;

  return frogbotError(GATEWAY_CODES[cause.code] ?? 'ai.request-rejected', {
    detail: cause.message,
    status: cause.status,
    data: { gatewayCode: cause.code, ...(cause.param ? { param: cause.param } : {}) },
    ...(retryAfter !== undefined && Number.isFinite(retryAfter) ? { retryAfter } : {}),
    cause,
  });
}
