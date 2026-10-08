import { getTranslation } from '@payloadcms/translations';
import { getCachedFrogBot } from 'frogbot';
import { hasFrogBot } from 'frogbot/internal';
import type { AdminViewServerProps } from 'payload';
import { formatAdminURL } from 'payload/shared';

import { ConnectionsPage } from './ConnectionsPage.client.js';
import { ConnectionsViewClient } from './ConnectionsView.client.js';
import { projectConnectionSchema } from './schema.js';
import type { ConnectionItem, ConnectionPiece } from './types.js';

export async function ConnectionsView({ initPageResult, payload }: AdminViewServerProps) {
  const { req: payloadReq } = initPageResult;
  const frogbot = hasFrogBot(payloadReq) ? payloadReq.frogbot : getCachedFrogBot();
  if (!payloadReq.user || !frogbot?.config.connections.enabled) return null;
  const req = Object.assign(payloadReq, { frogbot });
  const connections = frogbot.config.connections;
  const collection =
    connections.slug && initPageResult.collectionConfig?.slug === connections.slug
      ? initPageResult.collectionConfig
      : undefined;

  const pieces: ConnectionPiece[] = Object.values(connections.entries).map(
    ({ piece, oauth, secret, secretSchema, icon }) => ({
      slug: piece.piece,
      label: piece.piece.replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
      oauth,
      secret,
      ...(icon ? { icon } : {}),
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

  const view = (
    <ConnectionsViewClient
      apiPath={`${payload.config.routes.api.replace(/\/$/, '')}/connections`}
      returnTo={formatAdminURL({
        adminRoute: payload.config.routes.admin,
        path: collection ? `/collections/${collection.slug}` : '/settings/connections',
      })}
      pieces={pieces}
      initialConnections={initialConnections}
      initialError={initialError}
    />
  );

  return collection ? (
    <ConnectionsPage title={getTranslation(collection.labels.plural, req.i18n)}>
      {view}
    </ConnectionsPage>
  ) : (
    view
  );
}
