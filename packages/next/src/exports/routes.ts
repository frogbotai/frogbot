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

import { appIconEndpoints } from '../appIcon/endpoints.js';
import type { FrogBotConfigArg } from '../types.js';

function addAppIconEndpoints(config: SanitizedConfig): SanitizedConfig {
  for (const endpoint of appIconEndpoints()) {
    const exists = config.endpoints.some(
      ({ method, path }) => path === endpoint.path && method === endpoint.method,
    );

    if (!exists) config.endpoints.push(endpoint);
  }

  return config;
}

function withFrogBotConfig<THandler>(
  handlerBuilder: (config: Promise<SanitizedConfig>) => THandler,
): (config: FrogBotConfigArg) => THandler {
  return (config) => handlerBuilder(getPayloadConfig(config));
}

function withFrogBotRESTConfig<THandler>(
  handlerBuilder: (config: Promise<SanitizedConfig>) => THandler,
): (config: FrogBotConfigArg) => THandler {
  return (config) => handlerBuilder(getPayloadConfig(config).then(addAppIconEndpoints));
}

export const REST_DELETE = withFrogBotRESTConfig(PAYLOAD_REST_DELETE);
export const REST_GET = withFrogBotRESTConfig(PAYLOAD_REST_GET);
export const REST_OPTIONS = withFrogBotRESTConfig(PAYLOAD_REST_OPTIONS);
export const REST_PATCH = withFrogBotRESTConfig(PAYLOAD_REST_PATCH);
export const REST_POST = withFrogBotRESTConfig(PAYLOAD_REST_POST);
export const REST_PUT = withFrogBotRESTConfig(PAYLOAD_REST_PUT);
export const GRAPHQL_POST = withFrogBotConfig(PAYLOAD_GRAPHQL_POST);
export const GRAPHQL_PLAYGROUND_GET = withFrogBotConfig(PAYLOAD_GRAPHQL_PLAYGROUND_GET);
