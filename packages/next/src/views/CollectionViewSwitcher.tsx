import { ViewDescription } from '@payloadcms/ui';
import { RenderServerComponent } from '@payloadcms/ui/elements/RenderServerComponent';
import type { AdminViewServerProps, PayloadComponent } from 'payload';

import { ViewSwitcher } from '../elements/ViewSwitcher/index.client.js';
import { getActiveViewSlug, resolveCollectionViews } from './collectionViews.js';

export async function CollectionViewSwitcher(props: AdminViewServerProps) {
  if (!props.collectionSlug) return null;
  const { runtime, views } = await resolveCollectionViews(props);
  const descriptionComponent = (
    props.collectionConfig?.admin.custom?.frogbot as
      { descriptionComponent?: PayloadComponent } | undefined
  )?.descriptionComponent;
  const description = props.collectionConfig?.admin.description;
  return (
    <>
      {descriptionComponent ? (
        RenderServerComponent({
          Component: descriptionComponent,
          importMap: props.importMap,
          serverProps: props,
        })
      ) : description && typeof description !== 'function' ? (
        <ViewDescription collectionSlug={props.collectionSlug} description={description} />
      ) : null}
      <ViewSwitcher
        collectionSlug={props.collectionSlug}
        viewSlug={getActiveViewSlug(props) ?? runtime[0]?.slug}
        views={views}
      />
    </>
  );
}
