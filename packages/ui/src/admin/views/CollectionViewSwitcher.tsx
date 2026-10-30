import { ViewDescription } from '@payloadcms/ui';
import { RenderServerComponent } from '@payloadcms/ui/elements/RenderServerComponent';
import type {
  AdminViewServerProps,
  PayloadComponent,
  SanitizedCollectionConfig,
  StaticDescription,
} from 'payload';

import { ViewSwitcher } from '../elements/ViewSwitcher/index.client.js';
import { getActiveViewSlug, resolveCollectionViews } from './collectionViews.js';

type CollectionViewSwitcherProps = AdminViewServerProps & { description?: StaticDescription };

function getDescriptionComponent(config: SanitizedCollectionConfig | undefined) {
  return (config?.admin.custom?.frogbot as { descriptionComponent?: PayloadComponent } | undefined)
    ?.descriptionComponent;
}

function DocumentDescription(props: CollectionViewSwitcherProps & { collectionSlug: string }) {
  const { collectionSlug, description, payload } = props;
  const descriptionComponent = getDescriptionComponent(payload.collections[collectionSlug]?.config);

  if (descriptionComponent) {
    return RenderServerComponent({
      clientProps: { collectionSlug, description },
      Component: descriptionComponent,
      importMap: payload.importMap,
      serverProps: props,
    });
  }

  return description ? (
    <ViewDescription collectionSlug={collectionSlug} description={description} />
  ) : null;
}

export async function CollectionViewSwitcher(props: CollectionViewSwitcherProps) {
  if (!props.collectionSlug) return null;
  if (!props.collectionConfig) {
    return DocumentDescription({ ...props, collectionSlug: props.collectionSlug });
  }

  const { runtime, views } = await resolveCollectionViews(props);
  const descriptionComponent = getDescriptionComponent(props.collectionConfig);
  const description = props.collectionConfig.admin.description;

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
