'use client';

import { useStepNav } from '@payloadcms/ui';
import { usePathname } from 'next/navigation.js';
import { type ReactNode, useLayoutEffect, useRef } from 'react';

import { TabTitleSync } from './TabTitleSync.js';

export type StepNavResetProps = {
  children: ReactNode;
};

export function StepNavReset({ children }: StepNavResetProps) {
  const pathname = usePathname();
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
