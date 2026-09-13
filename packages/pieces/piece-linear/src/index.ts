import { definePiece } from 'frogbot/pieces';

import { createComment } from './actions/createComment.js';
import { createIssue } from './actions/createIssue.js';
import { createProject } from './actions/createProject.js';
import { rawGraphqlQuery } from './actions/rawGraphqlQuery.js';
import { updateIssue } from './actions/updateIssue.js';
import { updateProject } from './actions/updateProject.js';
import { createLinearClient } from './client.js';
import { linearAuth, linearOptions } from './config.js';
import { commentCreated } from './triggers/commentCreated.js';
import { issueCreated } from './triggers/issueCreated.js';
import { issueRemoved } from './triggers/issueRemoved.js';
import { issueUpdated } from './triggers/issueUpdated.js';
import { projectCreated } from './triggers/projectCreated.js';
import { projectRemoved } from './triggers/projectRemoved.js';
import { projectUpdated } from './triggers/projectUpdated.js';
import { linearWebhook } from './webhook.js';

export const linearActions = [
  'createIssue',
  'updateIssue',
  'createProject',
  'updateProject',
  'createComment',
  'rawGraphqlQuery',
] as const;
export const linearTriggers = [
  'commentCreated',
  'issueCreated',
  'issueUpdated',
  'issueRemoved',
  'projectCreated',
  'projectUpdated',
  'projectRemoved',
] as const;
export const linearScopes = [] as const;

export const createLinear = definePiece({
  slug: 'linear',
  label: 'Linear',
  admin: {
    description: 'Manage Linear issues, projects, comments, and webhooks',
    group: 'Productivity',
  },
  auth: linearAuth,
  options: linearOptions,
  client: createLinearClient,
  webhook: linearWebhook,
  actions: [createIssue, updateIssue, createProject, updateProject, createComment, rawGraphqlQuery],
  triggers: [
    commentCreated,
    issueCreated,
    issueUpdated,
    issueRemoved,
    projectCreated,
    projectUpdated,
    projectRemoved,
  ],
});
