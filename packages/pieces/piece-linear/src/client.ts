import { LinearClient } from '@linear/sdk';

import { linearAuth } from './config.js';

export type Linear = LinearClient;

export function createLinearClient({ auth }: { auth: unknown }) {
  return new LinearClient({ apiKey: linearAuth.parse(auth).apiKey });
}
