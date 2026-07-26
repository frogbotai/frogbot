import config from '@frogbot-config';
import '@frogbotai/next/css';
import type { ServerFunctionClient } from '@frogbotai/next/layouts';
import { handleServerFunctions, RootLayout } from '@frogbotai/next/layouts';
import React from 'react';

import { importMap } from './admin/importMap.js';
import './custom.scss';

const serverFunction: ServerFunctionClient = async function (args) {
  'use server';
  return handleServerFunctions({ ...args, config, importMap });
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <RootLayout config={config} importMap={importMap} serverFunction={serverFunction}>{children}</RootLayout>;
}
