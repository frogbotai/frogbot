import { setServerAdapter } from '@frogbotai/ui/admin/rsc';
import {
  handleServerFunctions as payloadHandleServerFunctions,
  RootLayout as PayloadRootLayout,
} from '@payloadcms/next/layouts';
import { getPayloadConfig } from 'frogbot/internal';
import { connection } from 'next/server.js';
import type { ComponentProps } from 'react';

import { NextRouterAdapter } from '../adapters/router.client.js';
import { nextServerAdapter } from '../adapters/server.js';
import type { FrogBotConfigArg } from '../types.js';
import { brandImportMapErrors } from '../utilities/brandImportMapErrors.js';

export type { ServerFunctionClient } from 'payload';

brandImportMapErrors();
setServerAdapter(nextServerAdapter);

type RootLayoutProps = Omit<ComponentProps<typeof PayloadRootLayout>, 'config'> & {
  readonly config: FrogBotConfigArg;
};

export async function RootLayout({ config, htmlProps, ...rest }: RootLayoutProps) {
  await connection();

  const pageHtmlProps = { ...htmlProps, 'data-fb-ui-page': '' };

  return (
    <NextRouterAdapter>
      <PayloadRootLayout {...rest} config={getPayloadConfig(config)} htmlProps={pageHtmlProps} />
    </NextRouterAdapter>
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
