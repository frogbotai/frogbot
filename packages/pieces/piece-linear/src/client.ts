import { LinearClient } from '@linear/sdk';

import { linearAuth } from './config.js';

export type Linear = LinearClient;

export function createLinearClient({ auth }: { auth: unknown }) {
  const credential = linearAuth.parse(auth);

  return new LinearClient(
    'apiKey' in credential
      ? { apiKey: credential.apiKey }
      : { accessToken: credential.accessToken },
  );
}
