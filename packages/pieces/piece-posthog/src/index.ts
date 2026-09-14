import { definePiece } from 'frogbot/pieces';

import { createEvent } from './actions/createEvent.js';
import { createProject } from './actions/createProject.js';
import { customApiCall } from './actions/customApiCall.js';
import { createPosthogClient } from './client.js';
import { posthogAuth } from './config.js';

export const posthogActions = ['createEvent', 'createProject', 'customApiCall'] as const;
export const posthogScopes = [] as const;

export const createPosthog = definePiece({
  slug: 'posthog',
  label: 'PostHog',
  admin: {
    description: 'Capture product analytics events and manage PostHog projects',
    group: 'Business Intelligence',
  },
  auth: posthogAuth,
  client: ({ auth }: { auth: unknown }) => createPosthogClient(posthogAuth.parse(auth)),
  actions: [createEvent, createProject, customApiCall],
});
