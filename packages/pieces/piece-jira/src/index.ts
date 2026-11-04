import { definePiece, type PieceOAuthAccount, type PieceOAuthRecipe } from 'frogbot/pieces';
import { z } from 'zod';

import { addAttachment } from './actions/addAttachment.js';
import { addComment } from './actions/addComment.js';
import { addWatcher } from './actions/addWatcher.js';
import { assignIssue } from './actions/assignIssue.js';
import { createIssue } from './actions/createIssue.js';
import { customApiCall } from './actions/customApiCall.js';
import { deleteComment } from './actions/deleteComment.js';
import { downloadAttachment } from './actions/downloadAttachment.js';
import { findUser } from './actions/findUser.js';
import { getAttachment } from './actions/getAttachment.js';
import { getIssue } from './actions/getIssue.js';
import { linkIssues } from './actions/linkIssues.js';
import { listBoards } from './actions/listBoards.js';
import { listChangelogs } from './actions/listChangelogs.js';
import { listComments } from './actions/listComments.js';
import { listComponents } from './actions/listComponents.js';
import { listFields } from './actions/listFields.js';
import { listIssueLinkTypes } from './actions/listIssueLinkTypes.js';
import { listIssueTypes } from './actions/listIssueTypes.js';
import { listPriorities } from './actions/listPriorities.js';
import { listProjects } from './actions/listProjects.js';
import { listSprints } from './actions/listSprints.js';
import { listStatuses } from './actions/listStatuses.js';
import { listUsers } from './actions/listUsers.js';
import { listVersions } from './actions/listVersions.js';
import { listWatchers } from './actions/listWatchers.js';
import { listWorklogs } from './actions/listWorklogs.js';
import { markdownToAdf } from './actions/markdownToAdf.js';
import { searchIssues } from './actions/searchIssues.js';
import { transitionIssue } from './actions/transitionIssue.js';
import { updateComment } from './actions/updateComment.js';
import { updateIssue } from './actions/updateIssue.js';
import { createJiraClient, type JiraClient } from './client.js';
import { type JiraAuth, jiraAuth, jiraOptions } from './config.js';
import { attachmentAdded } from './triggers/attachmentAdded.js';
import { commentAdded } from './triggers/commentAdded.js';
import { issueAssigned } from './triggers/issueAssigned.js';
import { issueCreated } from './triggers/issueCreated.js';
import { issueStatusChanged } from './triggers/issueStatusChanged.js';
import { issueTypeCreated } from './triggers/issueTypeCreated.js';
import { issueUpdated } from './triggers/issueUpdated.js';
import { priorityCreated } from './triggers/priorityCreated.js';
import { projectCreated } from './triggers/projectCreated.js';

export const jiraActions = [
  'createIssue',
  'updateIssue',
  'getIssue',
  'searchIssues',
  'assignIssue',
  'transitionIssue',
  'findUser',
  'addComment',
  'updateComment',
  'deleteComment',
  'listComments',
  'addAttachment',
  'getAttachment',
  'addWatcher',
  'linkIssues',
  'markdownToAdf',
  'downloadAttachment',
  'listProjects',
  'listIssueTypes',
  'listStatuses',
  'listPriorities',
  'listFields',
  'listIssueLinkTypes',
  'listUsers',
  'listVersions',
  'listComponents',
  'listBoards',
  'listSprints',
  'listWorklogs',
  'listWatchers',
  'listChangelogs',
  'customApiCall',
] as const;

export const jiraTriggers = [
  'issueCreated',
  'issueUpdated',
  'issueStatusChanged',
  'commentAdded',
  'issueAssigned',
  'attachmentAdded',
  'issueTypeCreated',
  'projectCreated',
  'priorityCreated',
] as const;

export const jiraScopes = {
  offline_access: 'offline_access',
  'read:jira-work': 'read:jira-work',
  'write:jira-work': 'write:jira-work',
  'read:jira-user': 'read:jira-user',
  'read:board-scope:jira-software': 'read:board-scope:jira-software',
  'read:sprint:jira-software': 'read:sprint:jira-software',
  'read:project:jira': 'read:project:jira',
} as const;

export { JiraError } from './client.js';

const myself = z.object({
  accountId: z.string(),
  displayName: z.string(),
  emailAddress: z.string().optional(),
});

export const jiraOAuth = {
  authorizationUrl: 'https://auth.atlassian.com/authorize',
  tokenUrl: 'https://auth.atlassian.com/oauth/token',
  scopes: {
    catalog: jiraScopes,
    defaults: [
      'write:jira-work',
      'read:board-scope:jira-software',
      'read:sprint:jira-software',
      'read:project:jira',
    ],
    required: ['offline_access', 'read:jira-work', 'read:jira-user'],
  },
  scopeSeparator: ' ',
  params: { audience: 'api.atlassian.com', prompt: 'consent' },
  toAuth({ tokens }) {
    if (!tokens.access_token?.trim()) {
      throw new Error('Atlassian sign-in did not return an access token.');
    }

    return { accessToken: tokens.access_token };
  },
  async account({ client }) {
    const account = await client.request(myself, { path: '/myself' });

    return {
      id: account.accountId,
      label: account.displayName,
      ...(account.emailAddress ? { email: account.emailAddress } : {}),
    };
  },
} satisfies PieceOAuthRecipe<JiraAuth, JiraClient, PieceOAuthAccount, keyof typeof jiraScopes>;

export const createJira = definePiece({
  slug: 'jira',
  label: 'Jira',
  admin: {
    description: 'Create, search and update Jira Cloud issues, comments and attachments',
    group: 'Productivity',
  },
  auth: jiraAuth,
  options: jiraOptions,
  oauth: jiraOAuth,
  client: createJiraClient,
  actions: [
    createIssue,
    updateIssue,
    getIssue,
    searchIssues,
    assignIssue,
    transitionIssue,
    findUser,
    addComment,
    updateComment,
    deleteComment,
    listComments,
    addAttachment,
    getAttachment,
    addWatcher,
    linkIssues,
    markdownToAdf,
    downloadAttachment,
    listProjects,
    listIssueTypes,
    listStatuses,
    listPriorities,
    listFields,
    listIssueLinkTypes,
    listUsers,
    listVersions,
    listComponents,
    listBoards,
    listSprints,
    listWorklogs,
    listWatchers,
    listChangelogs,
    customApiCall,
  ],
  triggers: [
    issueCreated,
    issueUpdated,
    issueStatusChanged,
    commentAdded,
    issueAssigned,
    attachmentAdded,
    issueTypeCreated,
    projectCreated,
    priorityCreated,
  ],
});
