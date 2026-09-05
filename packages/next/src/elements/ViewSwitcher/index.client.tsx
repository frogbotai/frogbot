'use client';

import './index.css';

import { useConfig, usePreferences } from '@payloadcms/ui';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { formatAdminURL } from 'payload/shared';

type CollectionView = {
  key: string;
  label: string;
  path: string;
};

export type ViewSwitcherProps = {
  collectionSlug: string;
  viewType?: string;
};

export function ViewSwitcher({ collectionSlug, viewType }: ViewSwitcherProps) {
  const { config, getEntityConfig } = useConfig();
  const { setPreference } = usePreferences();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const collection = getEntityConfig({ collectionSlug });
  const views = (
    collection?.admin as typeof collection.admin & {
      custom?: { frogbot?: { views?: CollectionView[] } };
    }
  )?.custom?.frogbot?.views;

  if (!views || views.length < 2) return null;

  const active =
    viewType ??
    views.find(({ path }) =>
      path === '' ? pathname.endsWith(`/collections/${collectionSlug}`) : pathname.endsWith(path),
    )?.key;
  const search = searchParams.toString();

  return (
    <nav aria-label="Collection views" className="view-switcher">
      {views.map((view) => {
        const href = formatAdminURL({
          adminRoute: config.routes.admin,
          path: `/collections/${collectionSlug}${view.path}`,
        });
        const isActive = active === view.key;
        const url = search ? `${href}?${search}` : href;

        return (
          <a
            aria-current={isActive ? 'page' : undefined}
            className={`view-switcher__link${isActive ? ' view-switcher__link--active' : ''}`}
            href={url}
            key={view.key}
            onClick={async (event) => {
              event.preventDefault();
              await setPreference(`frogbot-view-${collectionSlug}`, { view: view.key });
              router.push(url);
            }}
          >
            {view.label}
          </a>
        );
      })}
    </nav>
  );
}
