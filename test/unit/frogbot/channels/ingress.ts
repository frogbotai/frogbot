import { vi } from 'vitest';

import type { AgentConfig } from '../../../../packages/frogbot/src/agents/types.js';
import {
  initializeChannelHost,
  shutdownChannelHost,
} from '../../../../packages/frogbot/src/channels/host.js';
import { pieceInstanceRuntime } from '../../../../packages/frogbot/src/pieces/definePiece.js';
import type { ChannelPieceInstance } from '../../../../packages/frogbot/src/pieces/types.js';
import { buildIngressRegistry } from '../../../../packages/frogbot/src/triggers/registry.js';
import { channelFixture } from './helpers.js';

export function ingressFixture({
  instance,
  triggers,
  conversational = false,
}: {
  instance: ChannelPieceInstance;
  triggers: AgentConfig['triggers'];
  conversational?: boolean;
}) {
  const agent: AgentConfig = {
    slug: 'ops',
    instructions: '',
    channels: conversational ? [instance] : [],
    triggers,
  };

  const registry = buildIngressRegistry({ agents: [agent] });
  const { kv, values } = channelFixture();

  const frogbot = {
    agents: { ops: { slug: agent.slug, config: agent } },
    config: { _internal: { triggers: registry } },
    connections: {
      resolvePieceCredential: vi.fn(() =>
        Promise.resolve({
          auth: pieceInstanceRuntime(instance).auth,
          key: instance,
        }),
      ),
    },
    kv,
    queue: vi.fn(),
    logger: { info: vi.fn(), error: vi.fn() },
    getAPIURL: () => 'https://example.com/api',
  };

  return {
    frogbot,
    values,
    initialize: (startGateway = false) => initializeChannelHost(frogbot as never, startGateway),
    shutdown: () => shutdownChannelHost(frogbot as never),
    request: (body: string, headers: Record<string, string> = {}, slug = instance.slug) =>
      Object.assign(
        new Request(`https://example.com/api/webhooks/${slug}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...headers },
          body,
        }),
        { frogbot, context: {}, routeParams: { instance: slug } },
      ),
  };
}
