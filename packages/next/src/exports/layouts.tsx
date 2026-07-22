import {
  handleServerFunctions as payloadHandleServerFunctions,
  RootLayout as PayloadRootLayout,
} from '@payloadcms/next/layouts';
import type { ComponentProps } from 'react';

import { getPayloadConfig } from 'frogbot';

import type { FrogbotConfigArg } from '../types.js';

export type { ServerFunctionClient } from 'payload';

type RootLayoutProps = Omit<ComponentProps<typeof PayloadRootLayout>, 'config'> & {
  readonly config: FrogbotConfigArg;
};

export function RootLayout({ config, ...rest }: RootLayoutProps) {
  return <PayloadRootLayout {...rest} config={getPayloadConfig(config)} />;
}

type HandleServerFunctionsArgs = Omit<Parameters<typeof payloadHandleServerFunctions>[0], 'config'> & {
  config: FrogbotConfigArg;
};

export function handleServerFunctions(args: HandleServerFunctionsArgs): ReturnType<typeof payloadHandleServerFunctions> {
  const { config, ...rest } = args;
  return payloadHandleServerFunctions({ ...rest, config: getPayloadConfig(config) });
}
