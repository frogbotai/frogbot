import type { I18n } from '@payloadcms/translations';
import { RenderServerComponent } from '@payloadcms/ui/elements/RenderServerComponent';
import { notFound } from 'next/navigation';
import type { AdminViewServerProps } from 'payload';
import { createLocalReq } from 'payload';

import { getActiveViewSlug, resolveCollectionViews } from './collectionViews.js';
import { CollectionViewShell } from './CollectionViewShell.js';

async function withPageProps(props: AdminViewServerProps): Promise<AdminViewServerProps> {
  const partial = props as Partial<AdminViewServerProps> & Pick<AdminViewServerProps, 'payload'>;
  if (partial.importMap && partial.initPageResult) return props;

  return {
    ...props,
    importMap: partial.importMap ?? props.payload.importMap,
    initPageResult:
      partial.initPageResult ??
      ({
        collectionConfig: props.collectionConfig,
        permissions: props.permissions,
        req: await createLocalReq(
          {
            req: {
              i18n: props.i18n as I18n,
              query: props.searchParams ?? {},
            },
            user: props.user ?? undefined,
          },
          props.payload,
        ),
      } as AdminViewServerProps['initPageResult']),
  };
}

export async function CustomCollectionView(input: AdminViewServerProps) {
  const props = await withPageProps(input);
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
