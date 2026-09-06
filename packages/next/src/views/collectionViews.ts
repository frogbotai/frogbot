import type { CollectionView, FrogbotRequest } from 'frogbot';
import type { AdminViewServerProps } from 'payload';

export type RuntimeCollectionView = CollectionView & { slug: string };

export function getRuntimeViews(props: AdminViewServerProps): RuntimeCollectionView[] {
  return (
    (
      props.collectionConfig?.custom?.frogbot as
        { collectionViews?: RuntimeCollectionView[] } | undefined
    )?.collectionViews ?? []
  );
}

export async function resolveCollectionViews(props: AdminViewServerProps) {
  const runtime = getRuntimeViews(props);
  const allowed = await Promise.all(
    runtime.map(
      async (view) =>
        !view.access ||
        (await view.access({ req: props.initPageResult.req as unknown as FrogbotRequest })),
    ),
  );
  const metadata = (
    props.collectionConfig?.admin.custom?.frogbot as
      | {
          views?: Array<{
            label: string;
            orderField?: string;
            path: string;
            slug: string;
            type: string;
          }>;
        }
      | undefined
  )?.views;
  return {
    runtime,
    views: (metadata ?? []).filter((_, index) => allowed[index]),
  };
}

export function getActiveViewSlug(
  props: AdminViewServerProps & { routeSegments?: string[] },
): string | undefined {
  const segments = props.routeSegments ?? (props.params?.segments as string[] | undefined) ?? [];
  if (props.viewType === 'list') return undefined;
  if (props.viewType) return props.viewType;
  const last = segments.at(-1);
  return getRuntimeViews(props).some(({ slug }) => slug === last) ? last : undefined;
}
