import { RenderServerComponent } from '@payloadcms/ui/elements/RenderServerComponent';
import type { AdminViewServerProps } from 'payload';
import { formatAdminURL } from 'payload/shared';

import { getActiveViewSlug, resolveCollectionViews, withPageProps } from './collectionViews.js';
import { CollectionViewShell } from './CollectionViewShell.js';
import { RecordPanelRoot } from './panel/RecordPanelRoot.client.js';
import { redirectRecordParam } from './panel/redirectRecord.js';

export async function CustomCollectionView(input: AdminViewServerProps) {
  const props = await withPageProps(input);
  const { runtime, views } = await resolveCollectionViews(props);
  const activeSlug = getActiveViewSlug(props) ?? runtime[0]?.slug;
  const view = runtime.find(
    ({ slug }) => slug === activeSlug && views.some((item) => item.slug === slug),
  );

  if (!view || view.type !== 'custom' || !view.component) return props.server.notFound();
  const content = RenderServerComponent({
    Component: view.component,
    importMap: props.importMap,
    serverProps: props,
  });

  if (view.shell === false) {
    redirectRecordParam({
      collectionConfig: props.collectionConfig!,
      record: props.initPageResult.req.query?.record,
      redirect: (path) =>
        props.server.redirect(
          formatAdminURL({ adminRoute: props.clientConfig.routes.admin, path }),
        ),
    });

    return (
      <RecordPanelRoot collectionSlug={props.collectionConfig!.slug}>{content}</RecordPanelRoot>
    );
  }

  return (
    <CollectionViewShell {...props} view={view} views={views}>
      {content}
    </CollectionViewShell>
  );
}
