import { getTranslation } from '@payloadcms/translations';
import {
  type ConnectionMetadata,
  getCachedFrogBot,
  type SanitizedConnectionsConfig,
} from 'frogbot';
import { hasFrogBot, toFrogBotRequest } from 'frogbot/internal';
import type { AdminViewServerProps } from 'payload';
import { formatAdminURL } from 'payload/shared';

import { ConnectionsPage } from './ConnectionsPage.client.js';
import { ConnectionsViewClient } from './ConnectionsView.client.js';
import { projectConnectionSchema } from './schema.js';
import type { ConnectionItem, ConnectionPiece, ConnectionSlot } from './types.js';

function projectPiece({
  piece,
  oauth,
  secret,
  scopes,
  oauthLabel,
  secretSchema,
  icon,
}: SanitizedConnectionsConfig['entries'][string]): ConnectionPiece {
  return {
    slug: piece.piece,
    label: piece.piece.replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
    oauth,
    secret,
    ...(scopes ? { scopes } : {}),
    ...(oauthLabel ? { oauthLabel } : {}),
    ...(icon ? { icon } : {}),
    ...(secret && secretSchema ? { secretSchema: projectConnectionSchema(secretSchema) } : {}),
  };
}

function projectRow(row: ConnectionMetadata): ConnectionItem {
  return {
    id: row.id,
    piece: row.piece,
    method: row.method,
    status: row.status,
    scopes: row.scopes,
    expiresAt: row.expiresAt,
    account: row.account ? { label: row.account.label, email: row.account.email } : null,
  };
}

export async function ConnectionsView({ initPageResult, payload }: AdminViewServerProps) {
  const { req: payloadReq } = initPageResult;
  const frogbot = hasFrogBot(payloadReq) ? payloadReq.frogbot : getCachedFrogBot();
  if (!payloadReq.user || !frogbot?.config.connections.enabled) return null;
  const req = toFrogBotRequest(payloadReq, frogbot);
  const connections = frogbot.config.connections;
  const collection =
    connections.slug && initPageResult.collectionConfig?.slug === connections.slug
      ? initPageResult.collectionConfig
      : undefined;

  const pieces: ConnectionPiece[] = Object.values(connections.entries).map(projectPiece);

  let initialConnections: ConnectionItem[] = [];
  let initialError: string | undefined;
  try {
    initialConnections = (await frogbot.connections.list({ req })).map(projectRow);
  } catch {
    initialError = 'Could not load your linked accounts. Please try again.';
  }

  let slots: ConnectionSlot[] | undefined;
  if (Object.keys(connections.apps ?? {}).length) {
    try {
      const rows = await frogbot.connections.slots({ req });

      slots = Object.entries(connections.apps).flatMap(([app, entries]) =>
        Object.values(entries).map((entry) => {
          const row = rows.find(
            ({ app: name, piece }) => name === app && piece === entry.piece.piece,
          );

          return {
            app,
            piece: projectPiece(entry),
            ...(row ? { connection: projectRow(row) } : {}),
          };
        }),
      );
    } catch {
      slots = undefined;
    }
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
      slots={slots}
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
