import { definePiece } from 'frogbot/pieces';

import { addComment } from './actions/comments.js';
import {
  appendToPage,
  archiveDatabaseItem,
  createDatabaseItem,
  createPage,
  listDatabasePages,
  listDatabases,
  restoreDatabaseItem,
  updateDatabaseItem,
} from './actions/core.js';
import { customApiCall } from './actions/customApiCall.js';
import {
  findDatabaseItem,
  findPage,
  getBlockContent,
  getPageComments,
  retrieveDatabase,
} from './actions/read.js';
import { createNotionClient } from './client.js';
import { notionAuth } from './config.js';
import {
  newComment,
  newDatabaseItem,
  updatedDatabaseItem,
  updatedPage,
} from './triggers/polling.js';

export const notionActions = [
  'listDatabases',
  'createDatabaseItem',
  'updateDatabaseItem',
  'findDatabaseItem',
  'listDatabasePages',
  'createPage',
  'appendToPage',
  'getBlockContent',
  'archiveDatabaseItem',
  'restoreDatabaseItem',
  'addComment',
  'retrieveDatabase',
  'getPageComments',
  'findPage',
  'customApiCall',
] as const;
export const notionTriggers = [
  'newDatabaseItem',
  'updatedDatabaseItem',
  'newComment',
  'updatedPage',
] as const;

export const createNotion = definePiece({
  slug: 'notion',
  label: 'Notion',
  admin: {
    description: 'Create, find, update, and monitor Notion pages and databases',
    group: 'Productivity',
  },
  auth: notionAuth,
  client: createNotionClient,
  oauth: {
    authorizationUrl: 'https://api.notion.com/v1/oauth/authorize',
    tokenUrl: 'https://api.notion.com/v1/oauth/token',
    tokenEndpointAuthMethod: 'client_secret_basic',
    scopes: [],
    params: { owner: 'user' },
    toAuth: ({ tokens }) => ({ accessToken: tokens.access_token }),
  },
  actions: [
    listDatabases,
    createDatabaseItem,
    updateDatabaseItem,
    findDatabaseItem,
    listDatabasePages,
    createPage,
    appendToPage,
    getBlockContent,
    archiveDatabaseItem,
    restoreDatabaseItem,
    addComment,
    retrieveDatabase,
    getPageComments,
    findPage,
    customApiCall,
  ],
  triggers: [newDatabaseItem, updatedDatabaseItem, newComment, updatedPage],
});
