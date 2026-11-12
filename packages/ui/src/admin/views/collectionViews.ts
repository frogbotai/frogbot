import type { I18n } from '@payloadcms/translations';
import { getClientConfig } from '@payloadcms/ui/utilities/getClientConfig';
import type { CollectionView } from 'frogbot';
import { attachRegisteredFrogBot } from 'frogbot/internal';
import {
  type AdminViewServerProps,
  createPayloadRequest,
  type ListViewServerProps,
  type PayloadRequest,
} from 'payload';
import { formatAdminURL } from 'payload/shared';
import * as qs from 'qs-esm';

import { getLastViewPreferenceKey } from './preferences.js';
import { readViewPreference } from './viewSetup.js';

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
 * On a collection's default route with no query, sends the user to the view they last chose with
 * the view tabs, when it isn't the default one and they can still open it.
 */
export async function redirectToLastView({
  collectionSlug,
  req,
  server,
  views,
}: {
  collectionSlug: string;
  req: PayloadRequest;
  server: AdminViewServerProps['server'];
  views: Array<{ path: string; slug: string }>;
}): Promise<void> {
  if (!req.user || Object.keys(req.query ?? {}).length > 0) return;

  const preference = await readViewPreference(req, getLastViewPreferenceKey(collectionSlug));
  const last = views.find(({ slug }) => slug === preference?.view);

  if (!last || last === views[0]) return;

  server.redirect(
    formatAdminURL({
      adminRoute: req.payload.config.routes.admin,
      path: `/collections/${collectionSlug}${last.path}`,
    }),
  );
}

/** A request for a view rendered with the list's server props, which carry none. */
export async function createViewRequest({
  i18n,
  payload,
  searchParams,
  user,
}: Pick<AdminViewServerProps, 'i18n' | 'payload' | 'searchParams' | 'user'>) {
  return createPayloadRequest({
    payload,
    req: {
      i18n: i18n as I18n,
      query: qs.parse(qs.stringify(searchParams ?? {}), { depth: 10 }),
    },
    user: user ?? undefined,
  });
}

/**
 * A default board, calendar or custom view renders as Payload's list `Component`, which gets the
 * list's server props instead of a view's. Fills in what a view reads.
 */
export async function withPageProps(
  props: AdminViewServerProps | ListViewServerProps,
): Promise<AdminViewServerProps> {
  if ('initPageResult' in props && props.clientConfig && props.importMap) return props;
  const partial = props as Partial<AdminViewServerProps> & Pick<AdminViewServerProps, 'payload'>;

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
        req: await createViewRequest(props),
      } as AdminViewServerProps['initPageResult']),
  };
}
