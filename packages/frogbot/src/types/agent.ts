import type {
  Agent,
  GenerateTextResult,
  ModelMessage,
  StopCondition,
  StreamTextResult,
  ToolSet,
  UIMessage,
} from 'ai';

import type { ModelId } from './ai.js';
import type { AgentSlug } from './generated.js';
import type { FrogbotRequest } from './request.js';
import type { AnyTool } from './tool.js';

export type AgentAccess = (args: { req: FrogbotRequest }) => boolean | Promise<boolean>;

export type AgentConfig = {
  slug: string;
  model: ModelId;
  instructions: string;
  tools?: readonly AnyTool[];
  stopWhen?: StopCondition<ToolSet> | StopCondition<ToolSet>[];
  access?: AgentAccess;
};

export type AgentGenerateOpts = (
  | { prompt: string; messages?: never }
  | { prompt?: never; messages: UIMessage[] | ModelMessage[] }
) & {
  req?: FrogbotRequest;
  overrideAccess?: boolean;
  abortSignal?: AbortSignal;
};

export type AgentStreamOpts = AgentGenerateOpts;

export type AgentGenerateResult = GenerateTextResult<ToolSet, Record<string, unknown>, never>;
export type AgentStreamResult = StreamTextResult<ToolSet, Record<string, unknown>, never>;

export type AgentCallOptions = {
  req?: FrogbotRequest;
  overrideAccess?: boolean;
  runId?: string;
};

export type AgentInstance = {
  slug: string;
  config: AgentConfig;
  generate: (opts: AgentGenerateOpts) => Promise<AgentGenerateResult>;
  stream: (opts: AgentStreamOpts) => Promise<AgentStreamResult>;
};

export type InternalAgentInstance = AgentInstance & {
  aiAgent: Agent<AgentCallOptions, ToolSet, Record<string, unknown>, never>;
};

export type AgentRegistry = Record<AgentSlug, AgentInstance>;
