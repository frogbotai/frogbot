import {
  GRAPHQL_PLAYGROUND_GET as PAYLOAD_GRAPHQL_PLAYGROUND_GET,
  GRAPHQL_POST as PAYLOAD_GRAPHQL_POST,
  REST_DELETE as PAYLOAD_REST_DELETE,
  REST_GET as PAYLOAD_REST_GET,
  REST_OPTIONS as PAYLOAD_REST_OPTIONS,
  REST_PATCH as PAYLOAD_REST_PATCH,
  REST_POST as PAYLOAD_REST_POST,
  REST_PUT as PAYLOAD_REST_PUT,
} from '@payloadcms/next/routes';
import { getPayloadConfig } from 'frogbot/internal';
import type { SanitizedConfig } from 'payload';

import type { FrogBotConfigArg } from '../types.js';

function withFrogBotConfig<THandler>(
  handlerBuilder: (config: Promise<SanitizedConfig>) => THandler,
): (config: FrogBotConfigArg) => THandler {
  return (config) => handlerBuilder(getPayloadConfig(config));
}

export const REST_DELETE = withFrogBotConfig(PAYLOAD_REST_DELETE);
export const REST_GET = withFrogBotConfig(PAYLOAD_REST_GET);
export const REST_OPTIONS = withFrogBotConfig(PAYLOAD_REST_OPTIONS);
export const REST_PATCH = withFrogBotConfig(PAYLOAD_REST_PATCH);
export const REST_POST = withFrogBotConfig(PAYLOAD_REST_POST);
export const REST_PUT = withFrogBotConfig(PAYLOAD_REST_PUT);
export const GRAPHQL_POST = withFrogBotConfig(PAYLOAD_GRAPHQL_POST);
export const GRAPHQL_PLAYGROUND_GET = withFrogBotConfig(PAYLOAD_GRAPHQL_PLAYGROUND_GET);
