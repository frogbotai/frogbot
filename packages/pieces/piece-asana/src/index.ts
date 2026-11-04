import { definePiece, type PieceOAuthAccount, type PieceOAuthRecipe } from 'frogbot/pieces';
import { z } from 'zod';

import { createTask } from './actions/createTask.js';
import { customApiCall } from './actions/customApiCall.js';
import { downloadAttachment } from './actions/downloadAttachment.js';
import {
  listAttachments,
  listCustomFields,
  listDependencies,
  listProjects,
  listSections,
  listStories,
  listSubtasks,
  listTasks,
  listTeams,
  listUsers,
  listWorkspaces,
} from './actions/lists.js';
import { type AsanaClient, createAsanaClient } from './client.js';
import { type AsanaAuth, asanaAuth } from './config.js';

export { AsanaError } from './client.js';

export const asanaScopes = { default: 'default' } as const;

const tokenUser = z.object({
  gid: z.string(),
  name: z.string(),
  email: z.string().optional(),
});

export const asanaOAuth = {
  authorizationUrl: 'https://app.asana.com/-/oauth_authorize',
  tokenUrl: 'https://app.asana.com/-/oauth_token',
  scopes: { catalog: asanaScopes, defaults: [], required: ['default'] },
  pkce: true,
  toAuth({ tokens }) {
    if (!tokens.access_token?.trim()) {
      throw new Error('Asana sign-in did not return an access token.');
    }

    return { accessToken: tokens.access_token };
  },
  account({ tokens }) {
    const user = tokenUser.safeParse(tokens.data);

    if (!user.success) return Promise.reject(new Error('Asana sign-in did not name the user.'));

    return Promise.resolve({
      id: user.data.gid,
      label: user.data.name,
      ...(user.data.email ? { email: user.data.email } : {}),
    });
  },
} satisfies PieceOAuthRecipe<AsanaAuth, AsanaClient, PieceOAuthAccount, keyof typeof asanaScopes>;

export const createAsana = definePiece({
  slug: 'asana',
  label: 'Asana',
  admin: {
    description: 'Import and create Asana workspaces, projects, tasks, comments and attachments',
    group: 'Productivity',
  },
  auth: asanaAuth,
  oauth: asanaOAuth,
  client: createAsanaClient,
  actions: [
    listWorkspaces,
    listTeams,
    listProjects,
    listSections,
    listUsers,
    listTasks,
    listSubtasks,
    listDependencies,
    listCustomFields,
    listStories,
    listAttachments,
    downloadAttachment,
    createTask,
    customApiCall,
  ],
});
