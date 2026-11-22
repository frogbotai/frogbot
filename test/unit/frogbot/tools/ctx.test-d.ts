import { expectTypeOf } from 'vitest';
import { z } from 'zod';

import type { FrogBot } from '../../../../packages/frogbot/src/frogbot.js';
import type {
  AgentScheduleContext,
  AgentScheduleHandler,
  SkillContent,
  SkillCtx,
  Tool,
  ToolCtx,
} from '../../../../packages/frogbot/src/index.js';

const inputSchema = z.object({ id: z.string() });

expectTypeOf<ToolCtx['req']['frogbot']>().toEqualTypeOf<FrogBot>();
expectTypeOf<SkillCtx['req']['frogbot']>().toEqualTypeOf<FrogBot>();
expectTypeOf<AgentScheduleContext['req']['frogbot']>().toEqualTypeOf<FrogBot>();

export const readsTheAppFromReq: Tool<typeof inputSchema> = {
  slug: 'reads_the_app_from_req',
  description: 'Reaches the app through the request.',
  inputSchema,
  execute: ({ id }, { req }) => req.frogbot.findByID({ collection: 'users', id, req }),
};

export const toolWithAppField: Tool<typeof inputSchema> = {
  slug: 'tool_with_app_field',
  description: 'A tool context carries no separate app.',
  inputSchema,
  // @ts-expect-error -- a tool reaches the app through `req.frogbot`
  execute: (_input, { frogbot }) => frogbot,
};

export const skillReadsReq: SkillContent = ({ req }) =>
  String(req.frogbot.config.collections.length);

// @ts-expect-error -- skill content reaches the app through `req.frogbot`
export const skillWithAppField: SkillContent = ({ frogbot }) => String(frogbot);

export const scheduleReadsReq: AgentScheduleHandler = async ({ req }) => {
  await req.frogbot.find({ collection: 'users', req });
};

// @ts-expect-error -- a schedule handler reaches the app through `req.frogbot`
export const scheduleWithAppField: AgentScheduleHandler = ({ frogbot }) => void frogbot;
