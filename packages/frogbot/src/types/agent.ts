import type {
  Agent,
  GenerateTextResult,
  ModelMessage,
  StopCondition,
  StreamTextResult,
  ToolSet,
  UIMessage,
} from "ai";

import type { Frogbot } from "../frogbot.js";
import type { AgentSlug, FrogbotTypes } from "./generated.js";
import type { DocID } from "./operations.js";
import type { FrogbotRequest } from "./request.js";
import type { AnyTool } from "./tool.js";

export type AgentAccess = (args: {
  req: FrogbotRequest;
}) => boolean | Promise<boolean>;

export type AgentModelId = FrogbotTypes["models"];

export type AgentSchedule =
  | { every: `${number}${"s" | "m" | "h" | "d"}`; cron?: never; timezone?: never }
  | { cron: string; every?: never; timezone?: string };

export type AgentScheduleContext = {
  frogbot: Frogbot;
  agent: AgentInstance;
  req: FrogbotRequest;
  job: { id: DocID; scheduledFor: Date };
};

export type AgentScheduleHandler = (
  context: AgentScheduleContext,
) => void | Promise<void>;

export type AgentScheduleTrigger = {
  type: "schedule";
  slug: string;
  schedule: AgentSchedule;
} & (
  | { prompt: string; handler?: never }
  | { prompt?: never; handler: AgentScheduleHandler }
);

export type AgentConfig = {
  slug: string;
  model: AgentModelId;
  instructions: string;
  tools?: readonly AnyTool[];
  inheritTools?: false;
  stopWhen?: StopCondition<ToolSet> | StopCondition<ToolSet>[];
  access?: AgentAccess;
  triggers?: readonly AgentScheduleTrigger[];
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

export type AgentGenerateResult = GenerateTextResult<
  ToolSet,
  Record<string, unknown>,
  never
>;
export type AgentStreamResult = StreamTextResult<
  ToolSet,
  Record<string, unknown>,
  never
>;

export type AgentCallOptions = {
  req?: FrogbotRequest;
  overrideAccess?: boolean;
  runId?: string;
  threadId?: DocID;
};

export type AgentInstance = {
  slug: string;
  config: AgentConfig;
  aiAgent: Agent<AgentCallOptions, ToolSet, Record<string, unknown>, never>;
  generate: (opts: AgentGenerateOpts) => Promise<AgentGenerateResult>;
  stream: (opts: AgentStreamOpts) => Promise<AgentStreamResult>;
};

export type AgentRegistry = Record<AgentSlug, AgentInstance>;
