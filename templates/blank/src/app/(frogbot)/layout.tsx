import '@frogbotai/next/css';
import './custom.scss';

import config from '@frogbot-config';
import type { ServerFunctionClient } from '@frogbotai/next/layouts';
import { handleServerFunctions, RootLayout } from '@frogbotai/next/layouts';
import React from 'react';

import { importMap } from './admin/importMap.js';

type Args = {
  children: React.ReactNode;
};

const serverFunction: ServerFunctionClient = async function (args) {
  'use server';
  return handleServerFunctions({
    ...args,
    config,
    importMap,
  });
};

const Layout = ({ children }: Args) => (
  <RootLayout
    config={config}
    importMap={importMap}
    serverFunction={serverFunction}
  >
    {children}
  </RootLayout>
);

export default Layout;
