'use client';

import { shallowRouteState } from '@frogbotai/ui/admin';
import { useRouter } from 'next/navigation.js';
import { useEffect } from 'react';

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
 * Makes Back or Forward to an entry the admin moved to another page with `history.replaceState`
 * a client navigation to that page. Next 16 keeps the router tree of the page the entry was
 * rewritten from, refetches the entry with it, and falls back to a full reload. The listener is
 * added when this module loads, before Next's own, so it can take over.
 */
export function ShallowRouteListener() {
  const router = useRouter();

  useEffect(() => {
    shallowRouteRouter = router;
  }, [router]);

  return null;
}
