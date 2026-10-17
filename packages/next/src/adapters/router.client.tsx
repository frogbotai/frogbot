'use client';

import { RouterAdapterProvider, shallowRouteState } from '@frogbotai/ui/admin';
import { usePathname, useRouter, useSearchParams } from 'next/navigation.js';
import { type ReactNode, useEffect, useMemo } from 'react';

let shallowRouteRouter: ReturnType<typeof useRouter> | undefined;

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', (event) => {
    const state = event.state as Record<string, unknown> | null;

    if (state?.[shallowRouteState] !== true || !shallowRouteRouter) return;

    event.stopImmediatePropagation();

    shallowRouteRouter.replace(`${window.location.pathname}${window.location.search}`, {
      scroll: false,
    });
  });
}

/**
 * Supplies Next's router to FrogBot's admin.
 *
 * Back or Forward to an entry the admin moved to another page with `history.replaceState` becomes
 * a client navigation to that page. Next 16 keeps the router tree of the page the entry was
 * rewritten from, refetches the entry with it, and falls back to a full reload. The listener is
 * added when this module loads, before Next's own, so it can take over.
 */
export function NextRouterAdapter({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const value = useMemo(
    () => ({ pathname, router, searchParams }),
    [pathname, router, searchParams],
  );

  useEffect(() => {
    shallowRouteRouter = router;
  }, [router]);

  return <RouterAdapterProvider value={value}>{children}</RouterAdapterProvider>;
}
