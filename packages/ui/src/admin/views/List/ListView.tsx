import type { ListViewServerProps } from 'payload';
import { formatAdminURL } from 'payload/shared';
import * as qs from 'qs-esm';

import {
  createViewRequest,
  getRuntimeViews,
  redirectToLastView,
  resolveCollectionViews,
} from '../collectionViews.js';
import { buildFrameSlots } from '../frame.js';
import { isFreshQuery, pickViewSetup, resolveViewSetup } from '../viewSetup.js';
import { DefaultListView } from './DefaultListView.client.js';
import { ListFrameClient } from './ListFrame.client.js';

/**
 * The list view Payload renders. On the collection's own page it renders in FrogBot's shared view
 * frame with Payload's table, selection and page controls as its body. A relationship drawer and
 * the hierarchy view stay Payload's own list.
 */
export async function ListView(props: ListViewServerProps) {
  const {
    collectionConfig,
    data,
    i18n,
    limit,
    listSearchableFields,
    locale,
    params,
    payload,
    permissions,
    searchParams,
    server,
    user,
    ...clientProps
  } = props;

  const isPage = Array.isArray((params as { segments?: unknown } | undefined)?.segments);
  if (!isPage || clientProps.viewType === 'hierarchy') return <DefaultListView {...clientProps} />;

  const collectionSlug = collectionConfig.slug;
  const req = await createViewRequest({ i18n, payload, searchParams, user });
  const { views } = await resolveCollectionViews({ collectionConfig, req });
  const runtime = getRuntimeViews({ collectionConfig });
  const view = runtime[0]?.type === 'list' ? runtime[0] : undefined;
  const isList = clientProps.viewType === 'list' && view !== undefined;

  if (isList) {
    await redirectToLastView({ collectionSlug, req, server, views });

    const query = req.query ?? {};
    const setup = await resolveViewSetup({
      collectionSlug,
      query,
      req,
      viewSlug: view.slug,
    });

    const saved = pickViewSetup(setup.preference);

    if (isFreshQuery(query) && Object.keys(saved).length > 0) {
      server.redirect(
        `${formatAdminURL({
          adminRoute: payload.config.routes.admin,
          path: `/collections/${collectionSlug}`,
        })}?${qs.stringify({ ...query, ...saved })}`,
      );
    }
  }

  const slots = buildFrameSlots({
    activeSlug: view?.slug,
    adminRoute: payload.config.routes.admin,
    collectionConfig,
    hasCreatePermission: clientProps.hasCreatePermission,
    hasDeletePermission: Boolean(clientProps.hasDeletePermission),
    i18n,
    importMap: payload.importMap,
    runtime,
    serverProps: {
      collectionConfig,
      data,
      i18n,
      limit,
      listPreferences: props.listPreferences,
      listSearchableFields,
      locale,
      params,
      payload,
      permissions,
      searchParams,
      server,
      user,
    },
    skipLayoutSlots: true,
    view,
    views,
    viewType: clientProps.viewType,
  });

  const docs = (data as { docs?: unknown[] } | undefined)?.docs ?? [];
  const isEmpty = docs.length === 0 && !clientProps.groupedData?.length;

  return (
    <ListFrameClient
      {...slots}
      AfterList={clientProps.AfterList}
      AfterListTable={clientProps.AfterListTable}
      BeforeList={clientProps.BeforeList}
      BeforeListTable={clientProps.BeforeListTable}
      Description={clientProps.Description ?? slots.Description}
      isEmpty={isEmpty}
      listMenuItems={[...(clientProps.listMenuItems ?? []), ...(slots.listMenuItems ?? [])]}
      listProps={clientProps}
    />
  );
}
