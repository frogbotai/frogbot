import {
  EmptyResponseBodyError,
  Experimental_EvaluationUnsupportedQuestionTypeError,
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
  ToolChoiceViolationError,
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
    ToolCallRepairError.isInstance(err) ||
    ToolChoiceViolationError.isInstance(err)
  ) {
    return { bucket: 'upstream', status: 502 };
  }

  if (
    InvalidArgumentError.isInstance(err) ||
    Experimental_EvaluationUnsupportedQuestionTypeError.isInstance(err) ||
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

  if (LoadSettingError.isInstance(err)) {
    return { bucket: 'config', status: 500 };
  }

  return undefined;
}
