'use client';

import { createContext, type ReactNode, use } from 'react';

/** The navigation calls FrogBot's admin makes, matching Payload 4's `RouterAdapterRouter`. */
export type RouterAdapterRouter = {
  back: () => void;
  push: (path: string, options?: { scroll?: boolean }) => void;
  refresh: () => void;
  replace: (path: string, options?: { scroll?: boolean }) => void;
};

/** What a host framework supplies so FrogBot's admin can read and change the URL. */
export type RouterAdapter = {
  pathname: string;
  router: RouterAdapterRouter;
  searchParams: URLSearchParams;
};

const RouterAdapterContext = createContext<RouterAdapter | null>(null);

export function RouterAdapterProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: RouterAdapter;
}) {
  return <RouterAdapterContext value={value}>{children}</RouterAdapterContext>;
}

export function useRouterAdapter(): RouterAdapter {
  const adapter = use(RouterAdapterContext);

  if (!adapter) {
    throw new Error(
      '[frogbot] useRouterAdapter needs a RouterAdapterProvider. Render the admin inside your framework adapter, such as the RootLayout from @frogbotai/next.',
    );
  }

  return adapter;
}
