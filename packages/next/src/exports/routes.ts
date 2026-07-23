import {
  REST_DELETE as PAYLOAD_REST_DELETE,
  REST_GET as PAYLOAD_REST_GET,
  REST_OPTIONS as PAYLOAD_REST_OPTIONS,
  REST_PATCH as PAYLOAD_REST_PATCH,
  REST_POST as PAYLOAD_REST_POST,
  REST_PUT as PAYLOAD_REST_PUT,
} from '@payloadcms/next/routes';

import { getPayloadConfig } from 'frogbot';

import type { FrogbotConfigArg } from '../types.js';

type PayloadRestHandlerBuilder = typeof PAYLOAD_REST_GET;
function withFrogbotConfig(handlerBuilder: PayloadRestHandlerBuilder) {
  return (config: FrogbotConfigArg): ReturnType<PayloadRestHandlerBuilder> =>
    handlerBuilder(getPayloadConfig(config));
}

export const REST_DELETE = withFrogbotConfig(PAYLOAD_REST_DELETE);
export const REST_GET = withFrogbotConfig(PAYLOAD_REST_GET);
export const REST_OPTIONS = withFrogbotConfig(PAYLOAD_REST_OPTIONS);
export const REST_PATCH = withFrogbotConfig(PAYLOAD_REST_PATCH);
export const REST_POST = withFrogbotConfig(PAYLOAD_REST_POST);
export const REST_PUT = withFrogbotConfig(PAYLOAD_REST_PUT);
