import type {
  AgentManifestEntry as ProtocolAgentManifestEntry,
  AgentProfile,
  AgentReasoningOption,
} from '@frogbotai/protocol';
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

import type { AIOutput } from '../ai/types.js';
import type { ChannelChatAccess } from '../chat/channelAccess.js';
import type { CompactionOptions } from '../chat/compaction/run.js';
import type { ClientToolsOption, MessageDelivery } from '../chat/turn/types.js';
import type { DocID } from '../collections/config/types.js';
import type { FrogBot } from '../frogbot.js';
import type { MCPServer } from '../mcp/types.js';
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

export type AgentModelOptions = {
  default?: AgentModelId;
  options: '*' | readonly AgentModelId[];
};

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
      } & AgentPieceTriggerInput<TTrigger['input']> &
        (TTrigger extends { type: 'polling' } ? { schedule?: AgentSchedule } : { schedule?: never })
    : never;

export type { AgentProfile, AgentReasoningOption };

/** Builds an agent's instructions once per run from that run's request. */
export type AgentInstructions = ({ req }: { req: FrogBotRequest }) => string | Promise<string>;

export type AgentConfig<TTrigger extends PieceTriggerReference = PieceTriggerReference> = {
  slug: string;
  model?: AgentModelId | AgentModelOptions;
  /** Fixed text, or a function called once per run with the run's `req`. */
  instructions: string | AgentInstructions;
  profile?: AgentProfile;
  channels?: readonly ChannelPieceInstance[];
  skills?: readonly SkillConfig[];
  tools?: readonly (AnyTool | PieceAction | PieceInstance | MCPServer)[];
  inheritTools?: false;
  stopWhen?: StopCondition<ToolSet> | StopCondition<ToolSet>[];
  access?: AgentAccess;
  triggers?: readonly (AgentPieceTrigger<TTrigger> | AgentScheduleTrigger)[];
};

export type SanitizedAgentConfig = Omit<AgentConfig, 'model' | 'tools'> & {
  model: { default: AgentModelId; options: readonly AgentModelId[] };
  tools?: readonly AnyTool[];
  /** MCP servers from `tools`, the agent's own after the root ones it inherits. */
  mcp?: readonly MCPServer[];
  /** Skill discovery lines, appended after the instructions on every run. */
  skillLines?: readonly string[];
};

export type AgentSelection = {
  model?: AgentModelId;
  reasoning?: string;
};

export type AgentManifestEntry = ProtocolAgentManifestEntry<AgentModelId>;

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
  autoApprove?: boolean;
};

export type AgentGenerateOpts<O extends AIOutput = never> = AgentRunOpts &
  AgentSelection & {
    chatId?: DocID;
    output?: O;
  };

export type AgentStreamOpts<O extends AIOutput = never> = AgentRunOpts &
  AgentSelection & { output?: O };

export type AgentStreamMessageOpts = AgentRunOpts & {
  chatId: DocID;
  channelAccess?: ChannelChatAccess;
  clientTools?: ClientToolsOption;
  delivery?: MessageDelivery;
};

export type AgentGenerateResult<O extends AIOutput = never> = GenerateTextResult<
  ToolSet,
  Record<string, unknown>,
  O
>;

export type AgentStreamResult<O extends AIOutput = never> = StreamTextResult<
  ToolSet,
  Record<string, unknown>,
  O
>;

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
  selection?: AgentSelection;
  clientTools?: ClientToolsOption;
  autoApprove?: boolean;
  /** Set by chat turns: compacts the chat's history when it nears the model's window. */
  compaction?: CompactionOptions;
};

export type AgentInstance = {
  slug: string;
  config: SanitizedAgentConfig;
  aiAgent: Agent<AgentCallOptions, ToolSet, Record<string, unknown>, never>;
  generate: <O extends AIOutput = never>(
    opts: AgentGenerateOpts<O>,
  ) => Promise<AgentGenerateResult<O>>;
  stream: <O extends AIOutput = never>(opts: AgentStreamOpts<O>) => Promise<AgentStreamResult<O>>;
  streamMessage: (
    opts: AgentStreamMessageOpts,
  ) => Promise<AgentStreamMessageResult | AgentStreamMessageQueuedResult>;
};

export type AgentRegistry = Record<AgentSlug, AgentInstance>;
