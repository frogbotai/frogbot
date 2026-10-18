import {
  handleServerFunctions as payloadHandleServerFunctions,
  RootLayout as PayloadRootLayout,
} from '@payloadcms/next/layouts';
import { getPayloadConfig } from 'frogbot/internal';
import { connection } from 'next/server.js';
import type { ComponentProps } from 'react';

import { ShallowRouteListener } from '../adapters/router.client.js';
import type { FrogBotConfigArg } from '../types.js';
import { brandImportMapErrors } from '../utilities/brandImportMapErrors.js';

export type { ServerFunctionClient } from 'payload';

brandImportMapErrors();

type RootLayoutProps = Omit<ComponentProps<typeof PayloadRootLayout>, 'config'> & {
  readonly config: FrogBotConfigArg;
};

export async function RootLayout({ children, config, htmlProps, ...rest }: RootLayoutProps) {
  await connection();

  const pageHtmlProps = { ...htmlProps, 'data-fb-ui-page': '' };

  return (
    <PayloadRootLayout {...rest} config={getPayloadConfig(config)} htmlProps={pageHtmlProps}>
      <ShallowRouteListener />
      {children}
    </PayloadRootLayout>
  );
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
