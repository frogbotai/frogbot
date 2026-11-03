import { assertCron, resolveScheduleCron } from '../agents/resolveScheduleTasks.js';
import type { AgentConfig, AgentPieceTrigger } from '../agents/types.js';
import { pieceInstanceRuntime, pieceTriggerInstance } from '../pieces/definePiece.js';
import type { PieceInstance, PieceTriggerReference } from '../pieces/types.js';
import type { IngressRegistry } from './types.js';

const DEFAULT_POLL_CRON = '*/5 * * * *';

export function requiresAdapterVerification(entry: IngressRegistry[string]): boolean {
  const { definition } = pieceInstanceRuntime(entry.instance);

  return Boolean(
    definition.channel &&
    definition.webhook &&
    !definition.webhook.verify &&
    entry.subscribers.some(({ trigger }) => trigger.trigger.type === 'app'),
  );
}

function pollCron(
  { trigger, schedule }: AgentPieceTrigger & { trigger: PieceTriggerReference },
  agentSlug: string,
): string | undefined {
  const label = `Trigger '${trigger.slug}' in agent '${agentSlug}'`;

  if (trigger.type !== 'polling') {
    if (schedule !== undefined) {
      throw new Error(`[frogbot] ${label} sets a schedule, but only polling triggers take one.`);
    }

    return undefined;
  }

  if (schedule !== undefined) return resolveScheduleCron(schedule, label);

  return assertCron(trigger.schedule ?? DEFAULT_POLL_CRON, label);
}

export function buildIngressRegistry({
  agents,
}: {
  agents?: readonly AgentConfig[];
  instances?: readonly PieceInstance[];
}): IngressRegistry {
  const registry: IngressRegistry = Object.create(null);
  const mounts = new Map<
    string,
    { instance: PieceInstance; agentSlug: string; polling: boolean }
  >();

  const register = ({
    instance,
    agentSlug,
    polling = false,
  }: {
    instance: PieceInstance;
    agentSlug: string;
    polling?: boolean;
  }) => {
    const existing = mounts.get(instance.slug);
    if (existing && existing.instance !== instance) {
      const { definition } = pieceInstanceRuntime(instance);
      const label = existing.instance.piece === instance.piece ? definition.label : 'piece';
      const conflict = `Ingress slug '${instance.slug}' is shared by agents '${existing.agentSlug}' and '${agentSlug}'.`;

      throw new Error(
        existing.polling || polling
          ? `[frogbot] Two ${label} instances are mounted; give each a slug. ${conflict}`
          : `[frogbot] Two ${label} instances receive webhooks; give each a slug. ${conflict}`,
      );
    }

    if (existing) existing.polling ||= polling;
    else mounts.set(instance.slug, { instance, agentSlug, polling });
  };

  for (const agent of agents ?? []) {
    for (const instance of agent.channels ?? []) {
      register({ instance, agentSlug: agent.slug });

      const entry = registry[instance.slug] ?? { instance, subscribers: [] };
      entry.channelAgentSlug = agent.slug;
      registry[instance.slug] = entry;
    }

    for (const configured of agent.triggers ?? []) {
      if (!('trigger' in configured)) continue;
      const trigger = configured;
      const instance = pieceTriggerInstance(trigger.trigger);
      if (!instance) {
        throw new Error(`[frogbot] Unknown trigger reference in agent '${agent.slug}'.`);
      }

      const cron = pollCron(trigger, agent.slug);

      const { definition } = pieceInstanceRuntime(instance);
      if (trigger.trigger.type === 'app' && !definition.webhook) {
        throw new Error(
          `[frogbot] Trigger '${trigger.trigger.slug}' in agent '${agent.slug}' requires a webhook-enabled piece.`,
        );
      }

      let input: unknown;
      try {
        const schema = trigger.trigger.input;
        if (trigger.input === undefined) {
          const result = schema.safeParse(undefined);
          input = result.success ? result.data : schema.parse({});
        } else {
          input = schema.parse(trigger.input);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `[frogbot] Trigger '${trigger.trigger.slug}' in agent '${agent.slug}' has invalid input: ${message}`,
        );
      }

      register({ instance, agentSlug: agent.slug, polling: cron !== undefined });

      const entry = registry[instance.slug] ?? { instance, subscribers: [] };

      if (
        cron !== undefined &&
        entry.subscribers.some(
          (subscriber) =>
            subscriber.agentSlug === agent.slug &&
            subscriber.trigger.trigger.slug === trigger.trigger.slug,
        )
      ) {
        throw new Error(
          `[frogbot] Trigger '${instance.slug}/${trigger.trigger.slug}' is mounted twice in agent '${agent.slug}'. Each polling mount keeps one cursor, so mount it once or use a second instance with its own slug.`,
        );
      }

      entry.subscribers.push({
        agentSlug: agent.slug,
        piece: instance,
        trigger,
        input,
        ...(cron === undefined ? {} : { cron }),
      });

      registry[instance.slug] = entry;
    }
  }

  return registry;
}
