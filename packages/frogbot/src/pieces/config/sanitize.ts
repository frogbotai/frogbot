import type { SanitizedAgentConfig } from '../../agents/types.js';
import type { FrogBotConfig } from '../../config/types.js';
import type { SanitizedConnectionsConfig } from '../../connections/types.js';
import type { AnyTool } from '../../tools/types.js';
import type { IngressRegistry } from '../../triggers/types.js';
import { isPieceInstance, pieceToolInstance } from '../definePiece.js';
import type { SanitizedPiecesConfig } from '../types.js';

type CollectPieceInstancesProps = {
  config: FrogBotConfig;
  agents: SanitizedAgentConfig[] | undefined;
  rootTools: AnyTool[];
  triggers: IngressRegistry;
  connections: SanitizedConnectionsConfig;
};

export function collectPieceInstances({
  config,
  agents,
  rootTools,
  triggers,
  connections,
}: CollectPieceInstancesProps): SanitizedPiecesConfig {
  const configuredTools = [
    ...(config.tools ?? []),
    ...(config.agents ?? []).flatMap((agent) => agent.tools ?? []),
  ];

  const sanitizedTools = [...rootTools, ...(agents ?? []).flatMap((agent) => agent.tools ?? [])];

  return {
    instances: [
      ...new Set([
        ...Object.values(triggers).map(({ instance }) => instance),
        ...(config.agents ?? []).flatMap((agent) => agent.channels ?? []),
        ...configuredTools.filter(isPieceInstance),
        ...sanitizedTools.flatMap((tool) => pieceToolInstance(tool) ?? []),
        ...Object.values(connections.entries).map(({ piece }) => piece),
      ]),
    ],
  };
}
