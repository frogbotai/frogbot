import type { AgentConfig } from '../agents/types.js';
import { pieceInstanceRuntime, pieceTriggerInstance } from '../pieces/definePiece.js';
import type { PieceInstance } from '../pieces/types.js';
import type { IngressRegistry } from './types.js';

export function buildIngressRegistry({
  agents,
}: {
  agents?: readonly AgentConfig[];
  instances?: readonly PieceInstance[];
}): IngressRegistry {
  const registry: IngressRegistry = Object.create(null);
  const mounts = new Map<string, { instance: PieceInstance; agentSlug: string }>();
  const register = ({ instance, agentSlug }: { instance: PieceInstance; agentSlug: string }) => {
    const existing = mounts.get(instance.slug);
    if (existing && existing.instance !== instance) {
      const { definition } = pieceInstanceRuntime(instance);
      const label = existing.instance.piece === instance.piece ? definition.label : 'piece';
      throw new Error(
        `[frogbot] Two ${label} instances receive webhooks; give each a slug. Ingress slug '${instance.slug}' is shared by agents '${existing.agentSlug}' and '${agentSlug}'.`,
      );
    }
    if (!existing) mounts.set(instance.slug, { instance, agentSlug });
  };

  for (const agent of agents ?? []) {
    for (const instance of agent.channels ?? []) {
      register({ instance, agentSlug: agent.slug });
    }
    for (const configured of agent.triggers ?? []) {
      if (!('trigger' in configured)) continue;
      const trigger = configured;
      const instance = pieceTriggerInstance(trigger.trigger);
      if (!instance) {
        throw new Error(`[frogbot] Unknown trigger reference in agent '${agent.slug}'.`);
      }
      if (trigger.trigger.type === 'polling') {
        throw new Error(
          `[frogbot] Polling trigger '${trigger.trigger.slug}' in agent '${agent.slug}' is not supported.`,
        );
      }
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
      register({ instance, agentSlug: agent.slug });
      const entry = registry[instance.slug] ?? { instance, subscribers: [] };
      entry.subscribers.push({ agentSlug: agent.slug, piece: instance, trigger, input });
      registry[instance.slug] = entry;
    }
  }
  return registry;
}
