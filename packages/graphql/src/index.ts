import { configToSchema as payloadConfigToSchema } from '@payloadcms/graphql';
import { getPayloadConfig } from 'frogbot/internal';

import type { FrogBotConfigArg } from './types.js';

export async function configToSchema(
  config: FrogBotConfigArg,
): Promise<ReturnType<typeof payloadConfigToSchema>> {
  const payloadConfig = await getPayloadConfig(config);

  return payloadConfigToSchema(payloadConfig);
}
