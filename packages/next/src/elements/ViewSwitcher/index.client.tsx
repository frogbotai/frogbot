'use client';

import './index.css';

import { useConfig, usePreferences } from '@payloadcms/ui';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { formatAdminURL } from 'payload/shared';

type CollectionView = {
  label: string;
  path: string;
  slug: string;
  type: string;
};

export type ViewSwitcherProps = {
  collectionSlug: string;
  viewSlug?: string;
  views: CollectionView[];
};

export function ViewSwitcher({ collectionSlug, viewSlug, views }: ViewSwitcherProps) {
  const { config } = useConfig();
  const { setPreference } = usePreferences();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  if (views.length < 2) return null;

  const active =
    viewSlug ??
    views.find(({ path }) =>
      path === '' ? pathname.endsWith(`/collections/${collectionSlug}`) : pathname.endsWith(path),
    )?.slug;
  const search = searchParams.toString();

  return (
    <nav aria-label="Collection views" className="view-switcher">
      {views.map((view) => {
        const href = formatAdminURL({
          adminRoute: config.routes.admin,
          path: `/collections/${collectionSlug}${view.path}`,
        });
        const isActive = active === view.slug;
        const url = search ? `${href}?${search}` : href;

        return (
          <a
            aria-current={isActive ? 'page' : undefined}
            className={`view-switcher__link${isActive ? ' view-switcher__link--active' : ''}`}
            href={url}
            key={view.slug}
            onClick={async (event) => {
              event.preventDefault();
              await setPreference(`frogbot:collection-view:${collectionSlug}`, {
                view: view.slug,
              });
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
