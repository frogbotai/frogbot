import { RenderServerComponent } from '@payloadcms/ui/elements/RenderServerComponent';
import { notFound } from 'next/navigation';
import type { AdminViewServerProps } from 'payload';

import { getActiveViewSlug, resolveCollectionViews } from './collectionViews.js';
import { CollectionViewShell } from './CollectionViewShell.js';

export async function CustomCollectionView(props: AdminViewServerProps) {
  const { runtime, views } = await resolveCollectionViews(props);
  const activeSlug = getActiveViewSlug(props) ?? runtime[0]?.slug;
  const view = runtime.find(
    ({ slug }) => slug === activeSlug && views.some((item) => item.slug === slug),
  );
  if (!view || view.type !== 'custom' || !view.component) notFound();
  const content = RenderServerComponent({
    Component: view.component,
    importMap: props.importMap,
    serverProps: props,
  });
  if (view.shell === false) return content;
  return (
    <CollectionViewShell
      {...props}
      viewComponents={view.components}
      views={views}
      viewSlug={view.slug}
    >
      {content}
    </CollectionViewShell>
  );
}
