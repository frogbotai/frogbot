import type {
  Agent,
  GenerateTextResult,
  ModelMessage,
  StopCondition,
  StreamTextResult,
  ToolSet,
  UIMessage,
} from 'ai';

import type { AgentSlug, FrogbotTypes } from './generated.js';
import type { DocID } from './operations.js';
import type { FrogbotRequest } from './request.js';
import type { AnyTool } from './tool.js';

export type AgentAccess = (args: { req: FrogbotRequest }) => boolean | Promise<boolean>;

export type AgentModelId = FrogbotTypes['models'] | (string & {});

export type AgentConfig = {
  slug: string;
  model: AgentModelId;
  instructions: string;
  tools?: readonly AnyTool[];
  stopWhen?: StopCondition<ToolSet> | StopCondition<ToolSet>[];
  access?: AgentAccess;
};

type AgentRunOpts = (
  | { prompt: string; messages?: never }
  | { prompt?: never; messages: UIMessage[] | ModelMessage[] }
) & {
  req?: FrogbotRequest;
  overrideAccess?: boolean;
  abortSignal?: AbortSignal;
};

export type AgentGenerateOpts = AgentRunOpts & { threadId?: DocID };

export type AgentStreamOpts = AgentRunOpts;

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
  aiAgent: Agent<AgentCallOptions, ToolSet, Record<string, unknown>, never>;
  generate: (opts: AgentGenerateOpts) => Promise<AgentGenerateResult>;
  stream: (opts: AgentStreamOpts) => Promise<AgentStreamResult>;
};

export type AgentRegistry = Record<AgentSlug, AgentInstance>;
