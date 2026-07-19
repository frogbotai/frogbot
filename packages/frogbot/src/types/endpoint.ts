// Frogbot's endpoint and handler types.
//
// Same shape as Payload's but handler receives FrogbotRequest.

import type { FrogbotRequest } from './request.js';

export type Handler = (req: FrogbotRequest) => Promise<Response> | Response;

export type Endpoint = {
  custom?: Record<string, any>;
  handler: Handler;
  method: 'connect' | 'delete' | 'get' | 'head' | 'options' | 'patch' | 'post' | 'put';
  path: string;
};
