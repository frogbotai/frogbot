import type { I18n } from '@payloadcms/translations';
import { getClientConfig } from '@payloadcms/ui/utilities/getClientConfig';
import type { CollectionView } from 'frogbot';
import { attachRegisteredFrogBot } from 'frogbot/internal';
import { type AdminViewServerProps, createPayloadRequest, type PayloadRequest } from 'payload';

export type RuntimeCollectionView = CollectionView & { slug: string };

export function getRuntimeViews(
  props: Pick<AdminViewServerProps, 'collectionConfig'>,
): RuntimeCollectionView[] {
  return (
    (
      props.collectionConfig?.custom?.frogbot as
        { collectionViews?: RuntimeCollectionView[] } | undefined
    )?.collectionViews ?? []
  );
}

type ViewAccessProps = Pick<AdminViewServerProps, 'collectionConfig'> &
  (
    | { initPageResult: Pick<AdminViewServerProps['initPageResult'], 'req'> }
    | { req: PayloadRequest }
  );

export async function resolveCollectionViews(props: ViewAccessProps) {
  const runtime = getRuntimeViews(props);
  const req = 'initPageResult' in props ? props.initPageResult.req : props.req;
  const allowed = await Promise.all(
    runtime.map(
      async (view) => !view.access || (await view.access({ req: attachRegisteredFrogBot(req) })),
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

/**
 * A default board, calendar or custom view renders as Payload's list `Component`, which gets the
 * list's server props instead of a view's. Fills in what a view reads.
 */
export async function withPageProps(props: AdminViewServerProps): Promise<AdminViewServerProps> {
  const partial = props as Partial<AdminViewServerProps> & Pick<AdminViewServerProps, 'payload'>;
  if (partial.clientConfig && partial.importMap && partial.initPageResult) return props;

  const importMap = partial.importMap ?? props.payload.importMap;

  return {
    ...props,
    clientConfig:
      partial.clientConfig ??
      getClientConfig({
        config: props.payload.config,
        i18n: props.i18n,
        importMap,
        user: props.user ?? null,
      }),
    importMap,
    initPageResult:
      partial.initPageResult ??
      ({
        collectionConfig: props.collectionConfig,
        permissions: props.permissions,
        req: await createPayloadRequest({
          payload: props.payload,
          req: {
            i18n: props.i18n as I18n,
            query: props.searchParams ?? {},
          },
          user: props.user ?? undefined,
        }),
      } as AdminViewServerProps['initPageResult']),
  };
}
