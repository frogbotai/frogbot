import type {
  Agent,
  GenerateTextResult,
  ModelMessage,
  StopCondition,
  StreamTextResult,
  ToolSet,
  UIMessage,
} from 'ai';
import type { z } from 'zod';

import type { DocID } from '../collections/config/types.js';
import type { Frogbot } from '../frogbot.js';
import type {
  ChannelPieceInstance,
  PieceAction,
  PieceInstance,
  PieceResult,
  PieceTriggerReference,
} from '../pieces/types.js';
import type { SkillConfig } from '../skills/types.js';
import type { AnyTool } from '../tools/types.js';
import type { AgentSlug, FrogbotTypes } from '../types/generated.js';
import type { FrogbotRequest } from '../types/request.js';

export type AgentAccess = (args: {
  req: FrogbotRequest;
  agent: AgentInstance;
}) => boolean | Promise<boolean>;

export type AgentModelId = FrogbotTypes['models'];

export type AgentSchedule =
  | { every: `${number}${'s' | 'm' | 'h' | 'd'}`; cron?: never; timezone?: never }
  | { cron: string; every?: never; timezone?: string };

export type AgentScheduleContext = {
  frogbot: Frogbot;
  agent: AgentInstance;
  req: FrogbotRequest;
  job: { id: DocID; scheduledFor: Date };
};

export type AgentScheduleHandler = (context: AgentScheduleContext) => void | Promise<void>;

export type AgentScheduleTrigger = {
  type: 'schedule';
  slug: string;
  schedule: AgentSchedule;
} & ({ prompt: string; handler?: never } | { prompt?: never; handler: AgentScheduleHandler });

export type AgentPieceTrigger<TTrigger extends PieceTriggerReference = PieceTriggerReference> = {
  trigger: TTrigger;
  input?: TTrigger extends { input: infer TInput extends z.ZodType } ? z.output<TInput> : never;
  handler(args: {
    event: TTrigger extends { output: infer TOutput extends z.ZodType }
      ? z.output<TOutput>
      : PieceResult;
    agent: AgentInstance;
  }): Promise<void> | void;
};

export type AgentProfile = {
  name?: string;
  avatar?: string;
  description?: string;
};

export type AgentConfig = {
  slug: string;
  model?: AgentModelId;
  allowModels?: readonly AgentModelId[];
  instructions: string;
  profile?: AgentProfile;
  channels?: readonly ChannelPieceInstance[];
  skills?: readonly SkillConfig[];
  tools?: readonly (AnyTool | PieceAction | PieceInstance)[];
  inheritTools?: false;
  stopWhen?: StopCondition<ToolSet> | StopCondition<ToolSet>[];
  access?: AgentAccess;
  triggers?: readonly (AgentPieceTrigger | AgentScheduleTrigger)[];
};

export type SanitizedAgentConfig = Omit<AgentConfig, 'model' | 'tools'> & {
  model: AgentModelId;
  tools?: readonly AnyTool[];
};

export type AgentManifestEntry = {
  slug: string;
  label: string;
  source: 'config' | 'collection';
  defaultModel: AgentModelId;
  models: AgentModelId[];
};

export type AgentManifest = {
  defaultAgent: string;
  agents: AgentManifestEntry[];
};

type AgentRunOpts = (
  { prompt: string; messages?: never } | { prompt?: never; messages: UIMessage[] | ModelMessage[] }
) & {
  req?: FrogbotRequest;
  overrideAccess?: boolean;
  abortSignal?: AbortSignal;
};

export type AgentGenerateOpts = AgentRunOpts & { chatId?: DocID };

export type AgentStreamOpts = AgentRunOpts;

export type AgentGenerateResult = GenerateTextResult<ToolSet, Record<string, unknown>, never>;
export type AgentStreamResult = StreamTextResult<ToolSet, Record<string, unknown>, never>;

export type AgentCallOptions = {
  req?: FrogbotRequest;
  overrideAccess?: boolean;
  runId?: string;
  chatId?: DocID;
  model?: AgentModelId;
};

export type AgentInstance = {
  slug: string;
  config: SanitizedAgentConfig;
  aiAgent: Agent<AgentCallOptions, ToolSet, Record<string, unknown>, never>;
  generate: (opts: AgentGenerateOpts) => Promise<AgentGenerateResult>;
  stream: (opts: AgentStreamOpts) => Promise<AgentStreamResult>;
};

export type AgentRegistry = Record<AgentSlug, AgentInstance>;
