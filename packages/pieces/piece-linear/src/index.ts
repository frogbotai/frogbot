import type { TypedUser } from 'frogbot';
import {
  definePiece,
  findUserByEmail,
  type PieceChannel,
  type PieceOAuthAccount,
  type PieceOAuthRecipe,
} from 'frogbot/pieces';
import type { z } from 'zod';

import { createComment } from './actions/createComment.js';
import { createIssue } from './actions/createIssue.js';
import { createProject } from './actions/createProject.js';
import { rawGraphqlQuery } from './actions/rawGraphqlQuery.js';
import { updateIssue } from './actions/updateIssue.js';
import { updateProject } from './actions/updateProject.js';
import { LinearChannelAdapter } from './adapter.js';
import { createLinearClient, type Linear } from './client.js';
import { linearAuth, linearOptions } from './config.js';
import { linearQuestions } from './questions/index.js';
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
export const linearScopes = {
  read: 'read',
  write: 'write',
  'issues:create': 'issues:create',
  'comments:create': 'comments:create',
  'timeSchedule:write': 'timeSchedule:write',
  admin: 'admin',
  'app:assignable': 'app:assignable',
  'app:mentionable': 'app:mentionable',
} as const;

export const linearOAuth = {
  authorizationUrl: 'https://linear.app/oauth/authorize',
  tokenUrl: 'https://api.linear.app/oauth/token',
  scopes: {
    catalog: linearScopes,
    defaults: ['write', 'comments:create', 'issues:create', 'app:mentionable'],
    required: ['read'],
  },
  scopeSeparator: ',',
  params: { actor: 'app' },
  toAuth({ tokens }) {
    if (!tokens.access_token?.trim()) {
      throw new Error('Linear OAuth did not return an access token.');
    }

    return { accessToken: tokens.access_token };
  },
  async account({ client }) {
    const viewer = await client.viewer;

    if (!viewer.email?.trim()) {
      throw new Error('Linear did not return an account email address.');
    }

    return { id: viewer.id, label: viewer.name, email: viewer.email };
  },
} satisfies PieceOAuthRecipe<
  z.output<typeof linearAuth>,
  Linear,
  PieceOAuthAccount,
  keyof typeof linearScopes
>;

const linearChannel = {
  adapter({ auth, options }) {
    if (!options.webhookSecret) {
      throw new Error('Linear channels require a webhookSecret option.');
    }

    return new LinearChannelAdapter({
      ...('apiKey' in auth ? { apiKey: auth.apiKey } : { accessToken: auth.accessToken }),
      webhookSecret: options.webhookSecret,
      mode: options.channelMode,
      userName: options.botUsername,
    });
  },
  async identity({ author, client, req }): Promise<TypedUser | null> {
    const account = await client.user(author.userId);
    const email = account.email?.trim().toLowerCase();

    if (!email) return null;

    return findUserByEmail(req, email);
  },
  questions: linearQuestions,
} satisfies PieceChannel<z.output<typeof linearAuth>, z.output<typeof linearOptions>, Linear>;

export const createLinear = definePiece({
  slug: 'linear',
  label: 'Linear',
  admin: {
    description: 'Manage Linear issues, projects, comments, and webhooks',
    group: 'Productivity',
  },
  auth: linearAuth,
  options: linearOptions,
  oauth: linearOAuth,
  client: createLinearClient,
  webhook: linearWebhook,
  channel: linearChannel,
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
