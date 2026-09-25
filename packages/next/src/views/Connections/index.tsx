import type { FrogBotRequest } from 'frogbot';
import { getCachedFrogBot } from 'frogbot';
import type { AdminViewServerProps } from 'payload';
import { formatAdminURL } from 'payload/shared';

import { ConnectionsViewClient } from './ConnectionsView.client.js';
import { projectConnectionSchema } from './schema.js';
import type { ConnectionItem, ConnectionPiece } from './types.js';

export async function ConnectionsView({ initPageResult, payload }: AdminViewServerProps) {
  const req = initPageResult.req as unknown as FrogBotRequest;
  const frogbot = req.frogbot ?? getCachedFrogBot();
  if (!req.user || !frogbot?.config.connections.enabled) return null;
  const connections = frogbot.config.connections;

  const pieces: ConnectionPiece[] = Object.values(connections.entries).map(
    ({ piece, oauth, secret, secretSchema }) => ({
      slug: piece.piece,
      label: piece.piece.replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
      oauth,
      secret,
      ...(secret && secretSchema ? { secretSchema: projectConnectionSchema(secretSchema) } : {}),
    }),
  );
  let initialConnections: ConnectionItem[] = [];
  let initialError: string | undefined;
  try {
    initialConnections = (await frogbot.connections.list({ req })).map((row) => ({
      id: row.id,
      piece: row.piece,
      method: row.method,
      status: row.status,
      expiresAt: row.expiresAt,
      account: row.account ? { label: row.account.label, email: row.account.email } : null,
    }));
  } catch {
    initialError = 'Could not load your linked accounts. Please try again.';
  }

  return (
    <ConnectionsViewClient
      apiPath={`${payload.config.routes.api.replace(/\/$/, '')}/connections`}
      returnTo={formatAdminURL({
        adminRoute: payload.config.routes.admin,
        path: '/settings/connections',
      })}
      pieces={pieces}
      initialConnections={initialConnections}
      initialError={initialError}
    />
  );
}
