'use client';

import { RouterAdapterProvider } from '@frogbotai/ui/admin';
import { usePathname, useRouter, useSearchParams } from 'next/navigation.js';
import { type ReactNode, useMemo } from 'react';

export function NextRouterAdapter({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const value = useMemo(
    () => ({ pathname, router, searchParams }),
    [pathname, router, searchParams],
  );

  return <RouterAdapterProvider value={value}>{children}</RouterAdapterProvider>;
}
