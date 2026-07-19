// Gateway error classes.
//
// All gateway errors extend `GatewayError`. Each carries an HTTP `status`
// and a stable `code` so the OpenAI/Anthropic error envelope translators can
// map errors to a wire-correct response without sniffing the
// message string.

export type GatewayErrorCode =
  | 'config_invalid'
  | 'invalid_model_id'
  | 'model_not_found'
  | 'model_unsupported_operation'
  | 'no_providers'
  | 'provider_not_configured'
  | 'unsupported_modality'
  | 'invalid_request_body'
  | 'invalid_tool_arguments'
  | 'request_entity_too_large'
  | 'resource_not_found';

export const gatewayErrorMarker = Symbol.for('@frogbotai/gateway/GatewayError');

export class GatewayError extends Error {
  override readonly name: string = 'GatewayError';
  readonly [gatewayErrorMarker] = true;
  readonly status: number;
  readonly code: GatewayErrorCode;
  /** OpenAI `error.param` — request field this error applies to, when known. */
  readonly param: string | null;

  constructor(args: { message: string; status: number; code: GatewayErrorCode; param?: string | null }) {
    super(args.message);
    this.status = args.status;
    this.code = args.code;
    this.param = args.param ?? null;
  }
}

export function isGatewayError(err: unknown): err is GatewayError {
  return typeof err === 'object' && err !== null && (err as { [gatewayErrorMarker]?: unknown })[gatewayErrorMarker] === true;
}

/**
 * Thrown by `createGateway()` when the user-supplied config fails validation.
 * Carries a list of zod-style issue strings so the CLI / programmatic caller
 * can print every problem in one shot instead of failing one field at a time.
 */
export class ConfigError extends GatewayError {
  override readonly name = 'ConfigError';
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super({
      message:
        issues.length === 1
          ? `Invalid gateway config: ${issues[0]}`
          : `Invalid gateway config:\n  - ${issues.join('\n  - ')}`,
      status: 500,
      code: 'config_invalid',
    });
    this.issues = issues;
  }
}

/**
 * Thrown when a caller passes a model ID that isn't in the canonical
 * `<provider>/<model>` shape. Both the empty string and bare names
 * (`gpt-4o-mini`) trip this — model IDs are mandatory-prefixed in this
 * gateway (locked decision in the research doc).
 */
export class ModelIdError extends GatewayError {
  override readonly name = 'ModelIdError';

  constructor(modelId: string) {
    super({
      message: `Invalid model id "${modelId}": expected "<provider>/<model>" (e.g. "openai/gpt-4o-mini"). Bare model names are not accepted.`,
      status: 400,
      code: 'invalid_model_id',
      param: 'model',
    });
  }
}

/**
 * Thrown when a caller asks for a model whose provider is parseable but
 * absent from the gateway's configured registry. Maps to OpenAI's
 * `model_not_found` / 404 — from the client's perspective the model
 * doesn't exist on this gateway.
 */
export class ProviderNotConfiguredError extends GatewayError {
  override readonly name = 'ProviderNotConfiguredError';

  constructor(provider: string) {
    super({
      message: `Provider "${provider}" is not configured. Add it to the \`providers\` map when constructing the gateway.`,
      status: 404,
      code: 'provider_not_configured',
      param: 'model',
    });
  }
}

/**
 * Thrown when a caller asks model resolution for a modality the configured
 * provider doesn't implement.
 */
export class UnsupportedModalityError extends GatewayError {
  override readonly name = 'UnsupportedModalityError';

  constructor(args: { provider: string; modality: string; param?: string }) {
    super({
      message: `Provider "${args.provider}" does not support modality "${args.modality}".`,
      status: 400,
      code: 'unsupported_modality',
      param: args.param,
    });
  }
}

/**
 * Thrown when the request body fails schema validation. One instance is
 * thrown per zod issue; the route's error handler will emit the first.
 * `param` carries the dotted+indexed path the issue applies to
 * (e.g. `messages[0].content`, `tools[2].function.parameters`).
 */
export class RequestValidationError extends GatewayError {
  override readonly name = 'RequestValidationError';

  constructor(args: { message: string; param: string }) {
    super({
      message: args.message,
      status: 400,
      code: 'invalid_request_body',
      param: args.param,
    });
  }
}

/**
 * Thrown when a request body (or a file within it) exceeds the configured
 * `maxBodyBytes` cap. Maps to 413 `request_entity_too_large`, matching
 * OpenAI's wire behavior for oversized requests.
 */
export class BodyTooLargeError extends GatewayError {
  override readonly name = 'BodyTooLargeError';

  constructor(args: { message: string; param: string }) {
    super({
      message: args.message,
      status: 413,
      code: 'request_entity_too_large',
      param: args.param,
    });
  }
}

/**
 * Thrown when an assistant message contains a `tool_calls[*].function.arguments`
 * payload that fails to JSON-parse. OpenAI ships tool-call arguments as a
 * JSON-encoded string; if the string is malformed the only signal we get
 * is the parse failure — surface it as a 400 with the exact field path
 * instead of leaking it as an internal error.
 */
export class InvalidToolArgumentsError extends GatewayError {
  override readonly name = 'InvalidToolArgumentsError';

  constructor(args: { message: string; param: string }) {
    super({
      message: args.message,
      status: 400,
      code: 'invalid_tool_arguments',
      param: args.param,
    });
  }
}

/**
 * Thrown when a model ID resolves to a provider but the specific model is not
 * found in the catalog or the provider does not recognize it. Maps to 404.
 */
export class ModelNotFoundError extends GatewayError {
  override readonly name = 'ModelNotFoundError';

  constructor(modelId: string) {
    super({
      message: `Model "${modelId}" not found. Check the model ID and ensure it is available from the configured provider.`,
      status: 404,
      code: 'model_not_found',
      param: 'model',
    });
  }
}

/**
 * Thrown when a model exists but does not support the requested operation
 * (e.g. requesting chat completions from an embedding-only model).
 * Maps to 422 (subclass of FailedDependencyError semantics).
 */
export class ModelUnsupportedOperationError extends GatewayError {
  override readonly name = 'ModelUnsupportedOperationError';

  constructor(args: { modelId: string; operation: string }) {
    super({
      message: `Model "${args.modelId}" does not support operation "${args.operation}".`,
      status: 422,
      code: 'model_unsupported_operation',
      param: 'model',
    });
  }
}

/**
 * Thrown for requests to unmapped routes (unknown paths or unsupported
 * methods on an existing path). Maps to 404 `not_found_error` /
 * `resource_not_found` so the global fallback returns a JSON error envelope
 * instead of Hono's plain-text default.
 */
export class NotFoundError extends GatewayError {
  override readonly name = 'NotFoundError';

  constructor(message = 'Not Found') {
    super({
      message,
      status: 404,
      code: 'resource_not_found',
    });
  }
}

/**
 * Thrown when the gateway has zero providers configured and cannot route
 * any request. Distinguished from ProviderNotConfiguredError (specific
 * provider missing) — this means nothing is available at all.
 */
export class NoProvidersError extends GatewayError {
  override readonly name = 'NoProvidersError';

  constructor() {
    super({
      message: 'No providers are configured. Add at least one provider to the gateway config or set provider env vars.',
      status: 500,
      code: 'no_providers',
    });
  }
}
