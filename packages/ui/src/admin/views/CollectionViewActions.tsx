import { RenderServerComponent } from '@payloadcms/ui/elements/RenderServerComponent';
import type { PayloadRequest, ServerProps } from 'payload';
import { formatAdminURL } from 'payload/shared';

import { resolveCollectionViews } from './collectionViews.js';

export type CollectionViewActionsProps = ServerProps & {
  collectionSlug?: string;
  docID?: number | string;
  req?: PayloadRequest;
  viewType?: string;
};

/**
 * A root header action: on a collection's non-default FrogBot view, renders that view's
 * `components.actions` in the page header, where Payload puts the list's own.
 */
export async function CollectionViewActions(props: CollectionViewActionsProps) {
  const { collectionSlug, docID, payload, permissions, req, viewType } = props;
  const collectionConfig = collectionSlug ? payload.collections[collectionSlug]?.config : undefined;

  if (!collectionSlug || !collectionConfig || docID !== undefined || !viewType || !req) return null;

  const { runtime, views } = await resolveCollectionViews({ collectionConfig, req });
  const view = runtime.slice(1).find(({ slug }) => slug === viewType);
  const actions = view?.components?.actions;

  if (!view || !actions?.length || !views.some(({ slug }) => slug === view.slug)) return null;

  const collectionPermissions = permissions?.collections?.[collectionSlug];

  return RenderServerComponent({
    clientProps: {
      collectionSlug,
      hasCreatePermission: Boolean(collectionPermissions?.create),
      hasDeletePermission: Boolean(collectionPermissions?.delete),
      newDocumentURL: formatAdminURL({
        adminRoute: payload.config.routes.admin,
        path: `/collections/${collectionSlug}/create`,
      }),
    },
    Component: actions,
    importMap: payload.importMap,
    serverProps: props,
  });
}
