import { Cron } from 'croner';

import { defaultAccessFn, type SanitizedAIBase } from '../../ai/config/sanitize.js';
import { getConfiguredChatModelIds, getConfiguredModelIds } from '../../ai/models.js';
import type { ValidationMode } from '../../config/validationContext.js';
import { isPieceInstance, pieceInstanceRuntime } from '../../pieces/definePiece.js';
import { pieceCapabilities, type PieceInstance } from '../../pieces/types.js';
import { sanitizeSkills } from '../../skills/config/sanitize.js';
import { buildSkillTools } from '../../skills/tools.js';
import { sanitizeToolList } from '../../tools/config/sanitize.js';
import type { AnyTool } from '../../tools/types.js';
import { isRecord } from '../../utilities/isRecord.js';
import { everyToCron } from '../resolveScheduleTasks.js';
import type { AgentConfig, AgentModelId, SanitizedAgentConfig } from '../types.js';

export function sanitizeAgents({
  agents,
  ai,
  mode,
  rootTools,
}: {
  agents: AgentConfig[];
  ai: SanitizedAIBase | undefined;
  mode: ValidationMode;
  rootTools: AnyTool[];
}): SanitizedAgentConfig[] | undefined {
  if (!Array.isArray(agents)) {
    throw new Error('[frogbot] `agents` must be an array.');
  }

  if (agents.length === 0) {
    return undefined;
  }

  if (!ai) {
    throw new Error('[frogbot] `agents` requires an `ai` configuration block.');
  }

  const configuredModels = new Set(getConfiguredModelIds(ai));
  const chatModels = new Set(getConfiguredChatModelIds(ai));
  const slugs = new Set<string>();
  const channelOwners = new Map<PieceInstance, string>();

  return agents.map<SanitizedAgentConfig>((agent) => {
    if (!isRecord(agent) || typeof agent.slug !== 'string' || !agent.slug.trim()) {
      throw new Error('[frogbot] Every agent must have a `slug`.');
    }

    if (agent.slug !== agent.slug.trim() || encodeURIComponent(agent.slug) !== agent.slug) {
      throw new Error(`[frogbot] Agent slug '${agent.slug}' is not URL-safe.`);
    }

    if (slugs.has(agent.slug)) {
      throw new Error(`[frogbot] Duplicate agent slug: '${agent.slug}'.`);
    }

    slugs.add(agent.slug);

    const modelConfig =
      typeof agent.model === 'object' && agent.model !== null ? agent.model : undefined;

    const modelId =
      typeof agent.model === 'string' ? agent.model : (modelConfig?.default ?? ai.defaultModel);

    const allowModels = (agent as AgentConfig & { allowModels?: unknown }).allowModels;

    if (allowModels !== undefined) {
      const options = Array.isArray(allowModels)
        ? `[${allowModels.map((model) => `'${model}'`).join(', ')}]`
        : '[...]';

      throw new Error(
        `[frogbot] Agent '${agent.slug}' uses \`allowModels\`, which was removed. Use \`model: { default: '${modelId ?? '<default>'}', options: ${options} }\`.`,
      );
    }

    if (typeof modelId !== 'string' || !modelId.trim()) {
      throw new Error(
        `[frogbot] Agent '${agent.slug}' requires a \`model\` or \`ai.defaultModel\`.`,
      );
    }

    const options = modelConfig?.options;

    if (modelConfig && options !== '*' && !Array.isArray(options)) {
      throw new Error(`[frogbot] Agent '${agent.slug}' model.options must be \`'*'\` or an array.`);
    }

    const modelOptions = options === '*' ? [...chatModels] : (options ?? []);

    if (typeof agent.instructions !== 'string' || !agent.instructions.trim()) {
      throw new Error(`[frogbot] Agent '${agent.slug}' requires \`instructions\`.`);
    }

    if (agent.profile !== undefined) {
      if (!isRecord(agent.profile)) {
        throw new Error(`[frogbot] Agent '${agent.slug}' profile must be an object.`);
      }

      for (const field of ['name', 'avatar', 'description'] as const) {
        const value = agent.profile[field];
        if (value !== undefined && (typeof value !== 'string' || !value.trim())) {
          throw new Error(
            `[frogbot] Agent '${agent.slug}' profile ${field} must be a non-empty string.`,
          );
        }
      }
    }

    if (agent.access !== undefined && typeof agent.access !== 'function') {
      throw new Error(`[frogbot] Agent '${agent.slug}' access must be a function.`);
    }

    if (agent.channels !== undefined) {
      if (!Array.isArray(agent.channels)) {
        throw new Error(
          `[frogbot] Agent '${agent.slug}' channels must be an array when configured.`,
        );
      }

      for (const instance of agent.channels) {
        if (!isPieceInstance(instance) || !instance[pieceCapabilities].channel) {
          throw new Error(
            `[frogbot] Every channel in agent '${agent.slug}' must be a channel-capable piece instance.`,
          );
        }

        if (pieceInstanceRuntime(instance).auth === undefined) {
          throw new Error(
            `[frogbot] Channel '${instance.slug}' in agent '${agent.slug}' requires factory auth.`,
          );
        }

        const owner = channelOwners.get(instance);

        if (owner) {
          throw new Error(
            `[frogbot] Channel '${instance.slug}' is mounted by agents '${owner}' and '${agent.slug}'. Create a separate instance for each agent.`,
          );
        }

        channelOwners.set(instance, agent.slug);
      }
    }

    if (
      agent.stopWhen !== undefined &&
      typeof agent.stopWhen !== 'function' &&
      (!Array.isArray(agent.stopWhen) ||
        agent.stopWhen.length === 0 ||
        agent.stopWhen.some((condition) => typeof condition !== 'function'))
    ) {
      throw new Error(
        `[frogbot] Agent '${agent.slug}' stopWhen must contain at least one condition.`,
      );
    }

    for (const [field, candidate] of [
      [modelConfig ? 'model.default' : 'model', modelId],
      ...(options !== '*' ? modelOptions.map((model) => ['model.options', model]) : []),
    ] as Array<[string, unknown]>) {
      if (typeof candidate !== 'string' || !candidate.trim()) {
        throw new Error(`[frogbot] Agent '${agent.slug}' ${field} must contain model IDs.`);
      }

      const message = !configuredModels.has(candidate)
        ? `[frogbot] Agent '${agent.slug}' ${field} '${candidate}' is not configured.`
        : !chatModels.has(candidate)
          ? `[frogbot] Agent '${agent.slug}' ${field} '${candidate}' is not chat-capable.`
          : undefined;

      if (message) {
        if (mode === 'runtime') throw new Error(message);

        // eslint-disable-next-line no-console -- build-time config warnings go to the terminal
        console.warn(message);
      }
    }

    let agentTools: AnyTool[] | undefined;
    if (agent.tools !== undefined) {
      if (!Array.isArray(agent.tools)) {
        throw new Error(`[frogbot] Agent '${agent.slug}' tools must be an array when configured.`);
      }

      agentTools = sanitizeToolList(agent.tools, `Agent '${agent.slug}'`);
    }

    if (agent.inheritTools !== false && rootTools.length > 0) {
      const agentToolSlugs = new Set(agentTools?.map(({ slug }) => slug));

      for (const slug of agentToolSlugs) {
        if (rootTools.some((tool) => tool.slug === slug)) {
          // eslint-disable-next-line no-console -- build-time config warnings go to the terminal
          console.warn(
            `[frogbot] Agent '${agent.slug}' tool '${slug}' shadows root tool '${slug}'.`,
          );
        }
      }

      const inheritedTools = rootTools.filter(({ slug }) => !agentToolSlugs.has(slug));
      agentTools = [...inheritedTools, ...(agentTools ?? [])];
      agent = { ...agent, tools: agentTools };
    } else if (agentTools !== undefined) {
      agent = { ...agent, tools: agentTools };
    }

    if (agent.skills !== undefined) {
      if (!Array.isArray(agent.skills)) {
        throw new Error(`[frogbot] Agent '${agent.slug}' skills must be an array when configured.`);
      }

      sanitizeSkills(agent.slug, agent.skills);
      if (agent.skills.length > 0) {
        const toolSlugs = new Set(agentTools?.map(({ slug }) => slug));

        for (const slug of ['list_skills', 'load_skill', 'load_skill_resource']) {
          if (toolSlugs.has(slug)) {
            throw new Error(`[frogbot] Tool slug '${slug}' is reserved for agent skills.`);
          }
        }

        const skillLines = agent.skills.map(
          ({ slug, description }) => `- **${slug}**${description ? `: ${description}` : ''}`,
        );

        agentTools = [...(agentTools ?? []), ...buildSkillTools(agent.skills)];

        agent = {
          ...agent,
          instructions: `${agent.instructions}\n\n${skillLines.join('\n')}`,
        };
      }
    }

    if (agent.triggers !== undefined) {
      if (!Array.isArray(agent.triggers)) {
        throw new Error(
          `[frogbot] Agent '${agent.slug}' triggers must be an array when configured.`,
        );
      }

      const triggerSlugs = new Set<string>();

      for (const trigger of agent.triggers) {
        if (isRecord(trigger) && 'trigger' in trigger) continue;
        if (
          !isRecord(trigger) ||
          trigger.type !== 'schedule' ||
          typeof trigger.slug !== 'string' ||
          !trigger.slug.trim()
        ) {
          throw new Error(
            `[frogbot] Every trigger in agent '${agent.slug}' requires type 'schedule' and a slug.`,
          );
        }

        if (
          trigger.slug !== trigger.slug.trim() ||
          encodeURIComponent(trigger.slug) !== trigger.slug
        ) {
          throw new Error(
            `[frogbot] Trigger slug '${trigger.slug}' in agent '${agent.slug}' is not URL-safe.`,
          );
        }

        if (triggerSlugs.has(trigger.slug)) {
          throw new Error(
            `[frogbot] Duplicate trigger slug '${trigger.slug}' in agent '${agent.slug}'.`,
          );
        }

        triggerSlugs.add(trigger.slug);
        const hasPrompt = typeof trigger.prompt === 'string';
        const hasHandler = typeof trigger.handler === 'function';
        if (hasPrompt === hasHandler) {
          throw new Error(
            `[frogbot] Trigger '${trigger.slug}' in agent '${agent.slug}' requires exactly one of prompt or handler.`,
          );
        }

        if (hasPrompt && !(trigger.prompt as string).trim()) {
          throw new Error(
            `[frogbot] Trigger '${trigger.slug}' in agent '${agent.slug}' requires a non-empty prompt.`,
          );
        }

        if (!isRecord(trigger.schedule)) {
          throw new Error(
            `[frogbot] Trigger '${trigger.slug}' in agent '${agent.slug}' requires a schedule.`,
          );
        }

        const hasEvery = typeof trigger.schedule.every === 'string';
        const hasCron = typeof trigger.schedule.cron === 'string';
        if (hasEvery === hasCron) {
          throw new Error(
            `[frogbot] Trigger '${trigger.slug}' in agent '${agent.slug}' schedule requires exactly one of every or cron.`,
          );
        }

        if (trigger.schedule.timezone !== undefined) {
          throw new Error(
            `[frogbot] Trigger '${trigger.slug}' in agent '${agent.slug}' timezone is not yet supported. Cron schedules use UTC.`,
          );
        }

        const cron = hasEvery
          ? everyToCron(trigger.schedule.every as string)
          : (trigger.schedule.cron as string);

        try {
          new Cron(cron);
        } catch {
          throw new Error(
            `[frogbot] Trigger '${trigger.slug}' in agent '${agent.slug}' has an invalid cron expression: '${cron}'.`,
          );
        }
      }
    }

    return {
      ...agent,
      model: {
        default: modelId,
        options: [...new Set([modelId, ...modelOptions])] as AgentModelId[],
      },
      access: agent.access ?? defaultAccessFn,
      tools: agentTools,
    };
  });
}
