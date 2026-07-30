// Public error surface for the `@frogbotai/gateway` package (`./errors` subpath).
//
// Error classes, envelope builders, and retry/header helpers that downstream
// consumers (custom handlers, embedding hosts) may need. Stream-frame parsing,
// message masking, and header filtering are implementation details and are
// intentionally NOT re-exported here.

export { ClientAbortError, isClientAbort, isUpstreamAbortError } from './clientAbort.js';
export type {
  AnthropicErrorEnvelope,
  AnthropicErrorType,
  OpenAIErrorEnvelope,
  OpenAIErrorType,
} from './envelope.js';
export { toAnthropicErrorResponse,toOpenAIErrorResponse } from './envelope.js';
export type { GatewayErrorCode } from './gatewayError.js';
export {
  BodyTooLargeError,
  ConfigError,
  GatewayError,
  InvalidToolArgumentsError,
  isGatewayError,
  ModelIdError,
  ModelNotFoundError,
  ModelUnsupportedOperationError,
  NoProvidersError,
  NotFoundError,
  ProviderNotConfiguredError,
  RequestValidationError,
  UnsupportedModalityError,
} from './gatewayError.js';
export { headersForError, isRetryableError } from './normalizeAiSdkError.js';
export { CONTEXT_OVERFLOW_ENVELOPE,isContextOverflow } from './overflow.js';
export { buildRetryHeaders, isRetryableStatus } from './retryHeaders.js';
