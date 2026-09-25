import type { FrogBotRequest } from 'frogbot';

import { allow, hasRole } from './index.js';

declare module 'frogbot' {
  interface GeneratedTypes {
    roles: 'admin' | 'member';
  }
}

declare const req: FrogBotRequest;

hasRole(req, 'admin');
allow('member');
allow({ role: 'member', own: 'user' });

// @ts-expect-error Unlisted role slug.
hasRole(req, 'finence');
// @ts-expect-error Unlisted role slug.
allow('finence');
// @ts-expect-error Unlisted role slug.
allow({ role: 'finence', own: 'user' });
