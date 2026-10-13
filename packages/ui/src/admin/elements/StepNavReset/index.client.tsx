'use client';

import { useStepNav } from '@payloadcms/ui';
import { type ReactNode, useLayoutEffect, useRef } from 'react';

import { useRouterAdapter } from '../../adapters/router.js';
import { TabTitleSync } from './TabTitleSync.js';

export type StepNavResetProps = {
  children: ReactNode;
};

export function StepNavReset({ children }: StepNavResetProps) {
  const { pathname } = useRouterAdapter();
  const { setStepNav } = useStepNav();
  const previousPathname = useRef(pathname);

  useLayoutEffect(() => {
    if (previousPathname.current === pathname) return;

    previousPathname.current = pathname;
    setStepNav([]);
  }, [pathname, setStepNav]);

  return (
    <>
      <TabTitleSync />
      {children}
    </>
  );
}
