import {
  handleServerFunctions as payloadHandleServerFunctions,
  RootLayout as PayloadRootLayout,
} from '@payloadcms/next/layouts';
import { getPayloadConfig } from 'frogbot/internal';
import type { ComponentProps } from 'react';

import type { FrogBotConfigArg } from '../types.js';
import { brandImportMapErrors } from '../utilities/brandImportMapErrors.js';

export type { ServerFunctionClient } from 'payload';

brandImportMapErrors();

type RootLayoutProps = Omit<ComponentProps<typeof PayloadRootLayout>, 'config'> & {
  readonly config: FrogBotConfigArg;
};

export function RootLayout({ config, ...rest }: RootLayoutProps) {
  return <PayloadRootLayout {...rest} config={getPayloadConfig(config)} />;
}

type HandleServerFunctionsArgs = Omit<
  Parameters<typeof payloadHandleServerFunctions>[0],
  'config'
> & {
  config: FrogBotConfigArg;
};

export function handleServerFunctions(
  args: HandleServerFunctionsArgs,
): ReturnType<typeof payloadHandleServerFunctions> {
  const { config, ...rest } = args;
  return payloadHandleServerFunctions({ ...rest, config: getPayloadConfig(config) });
}
