// FrogBot's endpoint and handler types.
//
// Same shape as Payload's but handler receives FrogBotRequest.

import type { Endpoint as PayloadEndpoint } from 'payload';

import type { FrogBotRequest } from '../types/request.js';

export type Handler = (req: FrogBotRequest) => Promise<Response> | Response;

export type Endpoint = Omit<PayloadEndpoint, 'handler'> & {
  handler: Handler;
};
