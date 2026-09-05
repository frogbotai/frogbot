import { redirect } from 'next/navigation';
import { formatAdminURL } from 'payload/shared';

type CollectionView = {
  key: string;
  path: string;
};

export async function ViewRedirect({
  collectionConfig,
  collectionSlug,
  payload,
  req,
}: {
  collectionConfig: {
    admin: { custom?: { frogbot?: { views?: CollectionView[] } } };
  };
  collectionSlug: string;
  payload: {
    config: { routes: { admin: string } };
    find: (args: Record<string, unknown>) => Promise<{ docs: Array<{ value?: unknown }> }>;
  };
  req: { url?: string };
}) {
  const views = collectionConfig.admin.custom?.frogbot?.views;
  if (!views || views.length < 2) return null;

  const preferences = await payload.find({
    collection: 'payload-preferences',
    depth: 0,
    limit: 1,
    overrideAccess: false,
    req,
    where: { key: { equals: `frogbot-view-${collectionSlug}` } },
  });
  const selected = (preferences.docs[0]?.value as { view?: unknown } | undefined)?.view;
  const view = views.find(({ key }) => key === selected);
  if (!view || view.key === 'list') return null;

  const path = formatAdminURL({
    adminRoute: payload.config.routes.admin,
    path: `/collections/${collectionSlug}${view.path}`,
  });
  const search = req.url ? new URL(req.url, 'http://localhost').search : '';
  redirect(`${path}${search}`);
}
