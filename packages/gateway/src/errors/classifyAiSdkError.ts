// Exhaustive three-bucket classification for AI SDK error subclasses.
//
// The envelope translators (`envelope.ts`) handle a handful of AI SDK classes
// with bespoke messages/codes (`NoSuchModelError`, `InvalidPromptError`, etc.).
// Every other `AISDKError` subclass previously fell to the generic catch-all →
// 500 `server_error` with a null code, masking whether the fault was upstream
// (retryable 502), client-attributable (4xx), or a gateway config problem.
//
// This classifier buckets the remaining classes the same way hebo-gateway does
// (`hebo-gateway/src/errors/ai-sdk.ts:56-121`):
//
//   - `upstream` (502): the provider returned nothing usable / unparseable.
//   - `client`   (422): the request or the model's tool output was invalid.
//   - `config`   (500): a gateway credential/setting could not be loaded.
//
// Each translator maps the bucket to its own wire type/code. Classes already
// handled explicitly upstream of this call (APICallError, RetryError,
// NoSuchModelError, InvalidPromptError, TooManyEmbeddingValuesForCallError,
// LoadAPIKeyError, JSONParseError, TypeValidationError) are intentionally not
// repeated here.

import {
  EmptyResponseBodyError,
  InvalidArgumentError,
  InvalidResponseDataError,
  LoadSettingError,
  NoContentGeneratedError,
  NoSuchProviderReferenceError,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import {
  DownloadError,
  InvalidDataContentError,
  InvalidMessageRoleError,
  InvalidStreamPartError,
  InvalidToolApprovalError,
  InvalidToolInputError,
  MessageConversionError,
  MissingToolResultsError,
  NoImageGeneratedError,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  NoSpeechGeneratedError,
  NoSuchToolError,
  NoTranscriptGeneratedError,
  NoVideoGeneratedError,
  ToolCallNotFoundForApprovalError,
  ToolCallRepairError,
  UIMessageStreamError,
} from 'ai';

import type { GatewayHttpStatus } from './envelope.js';

export type AiSdkErrorBucket = 'upstream' | 'client' | 'config';

export type AiSdkErrorClassification = {
  bucket: AiSdkErrorBucket;
  status: GatewayHttpStatus;
};

/**
 * Classify an AI SDK error subclass into a status bucket. Returns `undefined`
 * for anything this classifier does not recognize (the caller keeps its
 * generic `AISDKError` catch-all as a safety net).
 */
export function classifyAiSdkError(err: unknown): AiSdkErrorClassification | undefined {
  // 502 — upstream fault: the provider returned nothing usable or unparseable.
  if (
    EmptyResponseBodyError.isInstance(err) ||
    InvalidResponseDataError.isInstance(err) ||
    NoContentGeneratedError.isInstance(err) ||
    NoImageGeneratedError.isInstance(err) ||
    NoObjectGeneratedError.isInstance(err) ||
    NoOutputGeneratedError.isInstance(err) ||
    NoSpeechGeneratedError.isInstance(err) ||
    NoTranscriptGeneratedError.isInstance(err) ||
    NoVideoGeneratedError.isInstance(err) ||
    InvalidStreamPartError.isInstance(err) ||
    UIMessageStreamError.isInstance(err) ||
    DownloadError.isInstance(err) ||
    ToolCallRepairError.isInstance(err)
  ) {
    return { bucket: 'upstream', status: 502 };
  }

  // 422 — client fault: the request or the model's tool output was invalid.
  if (
    InvalidArgumentError.isInstance(err) ||
    InvalidDataContentError.isInstance(err) ||
    InvalidMessageRoleError.isInstance(err) ||
    MessageConversionError.isInstance(err) ||
    InvalidToolInputError.isInstance(err) ||
    InvalidToolApprovalError.isInstance(err) ||
    ToolCallNotFoundForApprovalError.isInstance(err) ||
    MissingToolResultsError.isInstance(err) ||
    NoSuchToolError.isInstance(err) ||
    NoSuchProviderReferenceError.isInstance(err) ||
    UnsupportedFunctionalityError.isInstance(err)
  ) {
    return { bucket: 'client', status: 422 };
  }

  // 500 — config fault: a gateway credential/setting could not be loaded.
  if (LoadSettingError.isInstance(err)) {
    return { bucket: 'config', status: 500 };
  }

  return undefined;
}
