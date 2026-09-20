import '@frogbotai/next/css';

import config from '@frogbot-config';
import type { ServerFunctionClient } from '@frogbotai/next/layouts';
import { handleServerFunctions, RootLayout } from '@frogbotai/next/layouts';
import type { ReactNode } from 'react';

import { importMap } from './admin/importMap.js';

const serverFunction: ServerFunctionClient = async (args) => {
  'use server';

  return handleServerFunctions({ ...args, config, importMap });
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <RootLayout config={config} importMap={importMap} serverFunction={serverFunction}>
      {children}
    </RootLayout>
  );
}
