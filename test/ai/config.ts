import type { CollectionConfig } from 'frogbot';

import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';

export const usersSlug = 'users';
export const usageSlug = 'usage-logs';
export const providerKey = 'test-typesafe-key';

export const hookEvents: {
  phase: string;
  requestId: string;
  userId?: number | string;
  model?: string;
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
  error?: unknown;
}[] = [];

export let evaluationAllowed = true;

export function setEvaluationAllowed(value: boolean) {
  evaluationAllowed = value;
}

const Users: CollectionConfig = {
  slug: usersSlug,
  auth: true,
  access: openAccess,
  fields: [],
};

export default await buildTestConfig({
  collections: [Users],
  ai: {
    providers: { 'typesafe-ai': { apiKey: providerKey, models: ['jev-latest'] } },
    routers: { judge: { model: 'typesafe-ai/jev' } },
    access: { evaluate: ({ req }) => Boolean(req.user) && evaluationAllowed },
    hooks: {
      beforeOperation: [
        ({ phase, requestId, req }) => {
          hookEvents.push({ phase, requestId, userId: req?.user?.id });
        },
      ],
      beforeUpstream: [
        ({ phase, requestId, req, model }) => {
          hookEvents.push({ phase, requestId, userId: req?.user?.id, model });
        },
      ],
      afterUpstream: [
        ({ phase, requestId, req, usage }) => {
          hookEvents.push({ phase, requestId, userId: req?.user?.id, usage });
        },
      ],
      afterError: [
        ({ phase, requestId, req, error }) => {
          hookEvents.push({ phase, requestId, userId: req?.user?.id, error });
        },
      ],
      afterOperation: [
        ({ phase, requestId, req, model, usage, error }) => {
          hookEvents.push({ phase, requestId, userId: req?.user?.id, model, usage, error });
        },
      ],
    },
  },
});
