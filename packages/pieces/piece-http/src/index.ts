import { definePiece } from 'frogbot/pieces';

import { parseUrl } from './actions/parseUrl.js';
import { sendRequest } from './actions/sendRequest.js';

export const httpActions = ['sendRequest', 'parseUrl'] as const;
export const httpScopes = [] as const;

export const createHttp = definePiece({
  slug: 'http',
  label: 'HTTP',
  admin: { description: 'Send HTTP requests and parse URLs', group: 'Core' },
  actions: [sendRequest, parseUrl],
});
