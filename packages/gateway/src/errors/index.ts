// Public error surface for the `@frogbotai/gateway` package (`./errors` subpath).
//
// Error classes, envelope builders, and retry/header helpers that downstream
// consumers (custom handlers, embedding hosts) may need. Stream-frame parsing,
// message masking, and header filtering are implementation details and are
// intentionally NOT re-exported here.

export {
  GatewayError,
  isGatewayError,
  ConfigError,
  ModelIdError,
  ProviderNotConfiguredError,
  UnsupportedModalityError,
  RequestValidationError,
  BodyTooLargeError,
  InvalidToolArgumentsError,
  ModelNotFoundError,
  ModelUnsupportedOperationError,
  NotFoundError,
  NoProvidersError,
} from './gatewayError.js';
export type { GatewayErrorCode } from './gatewayError.js';

export { toOpenAIErrorResponse, toAnthropicErrorResponse } from './envelope.js';
export type {
  OpenAIErrorEnvelope,
  OpenAIErrorType,
  AnthropicErrorEnvelope,
  AnthropicErrorType,
} from './envelope.js';

export { buildRetryHeaders, isRetryableStatus } from './retryHeaders.js';
export { headersForError, isRetryableError } from './normalizeAiSdkError.js';
export { ClientAbortError, isClientAbort, isUpstreamAbortError } from './clientAbort.js';
export { isContextOverflow, CONTEXT_OVERFLOW_ENVELOPE } from './overflow.js';
