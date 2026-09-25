// FrogBot's endpoint and handler types.
//
// Same shape as Payload's but handler receives FrogBotRequest.

import type { FrogBotRequest } from '../types/request.js';

export type Handler = (req: FrogBotRequest) => Promise<Response> | Response;

export type Endpoint = {
  custom?: Record<string, any>;
  handler: Handler;
  method: 'connect' | 'delete' | 'get' | 'head' | 'options' | 'patch' | 'post' | 'put';
  path: string;
};
