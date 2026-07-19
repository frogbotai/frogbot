import type {
  AfterErrorHookArgs,
  AfterOperationHookArgs,
  AfterUpstreamHookArgs,
  BeforeOperationHookArgs,
  BeforeUpstreamHookArgs,
} from '@frogbotai/gateway/hooks';

import type { FrogbotRequest } from './request.js';

export type AIHookContext = {
  req?: FrogbotRequest;
  user?: FrogbotRequest['user'];
  agent?: {
    slug: string;
    runId: string;
  };
};

export type AIBeforeOperationHookArgs = BeforeOperationHookArgs & AIHookContext;
export type AIBeforeUpstreamHookArgs = BeforeUpstreamHookArgs & AIHookContext;
export type AIAfterUpstreamHookArgs = AfterUpstreamHookArgs & AIHookContext;
export type AIAfterErrorHookArgs = AfterErrorHookArgs & AIHookContext;
export type AIAfterOperationHookArgs = AfterOperationHookArgs & AIHookContext;

export type AIBeforeOperationHook = (args: AIBeforeOperationHookArgs) => void | Promise<void>;
export type AIBeforeUpstreamHook = (args: AIBeforeUpstreamHookArgs) => void | Promise<void>;
export type AIAfterUpstreamHook = (args: AIAfterUpstreamHookArgs) => void | Promise<void>;
export type AIAfterErrorHook = (args: AIAfterErrorHookArgs) => void | Promise<void>;
export type AIAfterOperationHook = (args: AIAfterOperationHookArgs) => void | Promise<void>;

export type AIHooks = {
  beforeOperation?: AIBeforeOperationHook[];
  beforeUpstream?: AIBeforeUpstreamHook[];
  afterUpstream?: AIAfterUpstreamHook[];
  afterError?: AIAfterErrorHook[];
  afterOperation?: AIAfterOperationHook[];
};

export type SanitizedAIHooks = {
  beforeOperation: AIBeforeOperationHook[];
  beforeUpstream: AIBeforeUpstreamHook[];
  afterUpstream: AIAfterUpstreamHook[];
  afterError: AIAfterErrorHook[];
  afterOperation: AIAfterOperationHook[];
};
