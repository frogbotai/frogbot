import type {
  Agent,
  GenerateTextResult,
  ModelMessage,
  StopCondition,
  StreamTextResult,
  ToolSet,
  UIMessage,
  UIMessageChunk,
} from 'ai';
import type { z } from 'zod';

import type { ChannelChatAccess } from '../chat/channelAccess.js';
import type { ClientToolsOption, MessageDelivery } from '../chat/turn/types.js';
import type { DocID } from '../collections/config/types.js';
import type { FrogBot } from '../frogbot.js';
import type {
  ChannelPieceInstance,
  PieceAction,
  PieceInstance,
  PieceResult,
  PieceTriggerReference,
} from '../pieces/types.js';
import type { SkillConfig } from '../skills/types.js';
import type { AnyTool } from '../tools/types.js';
import type { AgentSlug, FrogBotTypes } from '../types/generated.js';
import type { FrogBotRequest } from '../types/request.js';

export type AgentAccess = (args: {
  req: FrogBotRequest;
  agent: AgentInstance;
}) => boolean | Promise<boolean>;

export type AgentModelId = FrogBotTypes['models'];

export type AgentSchedule =
  | { every: `${number}${'s' | 'm' | 'h' | 'd'}`; cron?: never; timezone?: never }
  | { cron: string; every?: never; timezone?: string };

export type AgentScheduleContext = {
  frogbot: FrogBot;
  agent: AgentInstance;
  req: FrogBotRequest;
  job: { id: DocID; scheduledFor: Date };
};

export type AgentScheduleHandler = (context: AgentScheduleContext) => void | Promise<void>;

export type AgentScheduleTrigger = {
  type: 'schedule';
  slug: string;
  schedule: AgentSchedule;
} & ({ prompt: string; handler?: never } | { prompt?: never; handler: AgentScheduleHandler });

type AgentPieceTriggerInput<TInput extends z.ZodType> =
  Record<string, never> extends z.input<TInput>
    ? { input?: z.input<TInput> }
    : undefined extends z.input<TInput>
      ? { input?: z.input<TInput> }
      : { input: z.input<TInput> };

export type AgentPieceTrigger<TTrigger extends PieceTriggerReference = PieceTriggerReference> =
  TTrigger extends PieceTriggerReference
    ? {
        type?: never;
        trigger: TTrigger;
        handler(args: {
          event: TTrigger extends { output: infer TOutput extends z.ZodType }
            ? z.output<TOutput>
            : PieceResult;
          agent: AgentInstance;
          req: FrogBotRequest;
        }): Promise<void> | void;
      } & AgentPieceTriggerInput<TTrigger['input']>
    : never;

export type AgentProfile = {
  name?: string;
  avatar?: string;
  description?: string;
};

export type AgentConfig<TTrigger extends PieceTriggerReference = PieceTriggerReference> = {
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
  triggers?: readonly (AgentPieceTrigger<TTrigger> | AgentScheduleTrigger)[];
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
  req?: FrogBotRequest;
  overrideAccess?: boolean;
  abortSignal?: AbortSignal;
};

export type AgentGenerateOpts = AgentRunOpts & { chatId?: DocID };

export type AgentStreamOpts = AgentRunOpts;
export type AgentStreamMessageOpts = AgentRunOpts & {
  chatId: DocID;
  channelAccess?: ChannelChatAccess;
  clientTools?: ClientToolsOption;
  delivery?: MessageDelivery;
};

export type AgentGenerateResult = GenerateTextResult<ToolSet, Record<string, unknown>, never>;
export type AgentStreamResult = StreamTextResult<ToolSet, Record<string, unknown>, never>;

export type AgentStreamMessageResult = AgentStreamResult & {
  chatId: DocID;
  uiMessageStream: ReadableStream<UIMessageChunk>;
  persistence: Promise<void>;
};

export type AgentStreamMessageQueuedResult = {
  status: 'queued';
  chatId: DocID;
  messageId: string;
  delivery: MessageDelivery;
};

export type AgentCallOptions = {
  req?: FrogBotRequest;
  overrideAccess?: boolean;
  runId?: string;
  chatId?: DocID;
  replyCreatedAt?: string;
  model?: AgentModelId;
  clientTools?: ClientToolsOption;
};

export type AgentInstance = {
  slug: string;
  config: SanitizedAgentConfig;
  aiAgent: Agent<AgentCallOptions, ToolSet, Record<string, unknown>, never>;
  generate: (opts: AgentGenerateOpts) => Promise<AgentGenerateResult>;
  stream: (opts: AgentStreamOpts) => Promise<AgentStreamResult>;
  streamMessage: (
    opts: AgentStreamMessageOpts,
  ) => Promise<AgentStreamMessageResult | AgentStreamMessageQueuedResult>;
};

export type AgentRegistry = Record<AgentSlug, AgentInstance>;
