import type { Endpoint as PayloadEndpoint } from 'payload';

import type { FrogBotRequest } from '../types/request.js';

export type Handler = (req: FrogBotRequest) => Promise<Response> | Response;

export type Endpoint = Omit<PayloadEndpoint, 'handler'> & {
  handler: Handler;
};
