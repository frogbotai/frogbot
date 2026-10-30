import { NoListResults } from '@payloadcms/ui';
import { RenderServerComponent } from '@payloadcms/ui/elements/RenderServerComponent';
import type { ListViewServerProps, PayloadComponent } from 'payload';
import type { ReactNode } from 'react';

import { getRuntimeViews } from '../collectionViews.js';
import { DefaultListView, type ListPageSlots } from './DefaultListView.client.js';

/**
 * The list view Payload renders. FrogBot's toolbar, `CreateButton` and empty state fill Payload's
 * own list slots, and the client list view gets no server props.
 */
export function ListView(props: ListViewServerProps) {
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

  const { collectionSlug, hasCreatePermission, hasDeletePermission, newDocumentURL, viewType } =
    clientProps;

  const view = getRuntimeViews({ collectionConfig }).find(({ type }) => type === 'list');
  const toolbar = view?.type === 'list' ? view.components?.toolbar : undefined;
  const CreateButton =
    viewType === 'trash'
      ? undefined
      : (collectionConfig.admin.components as { CreateButton?: PayloadComponent } | undefined)
          ?.CreateButton;

  const { NoResults, ...listProps } = clientProps;

  if (!toolbar?.length && !CreateButton && !NoResults) return <DefaultListView {...clientProps} />;

  const createProps = { collectionSlug, hasCreatePermission, newDocumentURL };
  const render = (Component: PayloadComponent | PayloadComponent[], slotProps: object) =>
    RenderServerComponent({
      clientProps: slotProps,
      Component,
      importMap: payload.importMap,
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
    });

  const createButton = (key: string) => (
    <div className="fb-create-button" key={key}>
      {CreateButton ? render(CreateButton, createProps) : null}
    </div>
  );

  const isEmpty = (data as { docs?: unknown[] } | undefined)?.docs?.length === 0;
  const pageSlots: ListPageSlots = {
    ...(NoResults
      ? { NoResults }
      : CreateButton && isEmpty
        ? {
            NoResults: (
              <NoListResults
                Actions={[createButton('create')]}
                description={i18n.t('general:noResultsDescription')}
                title={i18n.t('general:noResultsFound')}
                withMargin
              />
            ),
          }
        : {}),
    ...(toolbar?.length || CreateButton
      ? {
          beforeActions: [
            ...(clientProps.beforeActions ?? []),
            ...(toolbar?.length
              ? (render(toolbar, { ...createProps, hasDeletePermission }) as ReactNode[])
              : []),
            ...(CreateButton ? [createButton('create-button')] : []),
          ],
        }
      : {}),
    ...(CreateButton ? { hideCreateNew: true } : {}),
  };

  return <DefaultListView {...listProps} pageSlots={pageSlots} />;
}
