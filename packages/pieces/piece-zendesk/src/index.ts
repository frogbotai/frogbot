import { definePiece } from 'frogbot/pieces';

import { downloadAttachment } from './actions/attachments.js';
import { customApiCall } from './actions/customApiCall.js';
import {
  exportArticles,
  exportOrganizations,
  exportTicketEvents,
  exportTickets,
  exportUsers,
} from './actions/export.js';
import {
  listCategories,
  listGroups,
  listMacros,
  listOrganizationFields,
  listSections,
  listSlaPolicies,
  listTicketComments,
  listTicketFields,
  listUserFields,
  listViews,
} from './actions/lists.js';
import { createZendeskClient } from './client.js';
import { zendeskAuth } from './config.js';

export { ZendeskError } from './client.js';

export const createZendesk = definePiece({
  slug: 'zendesk',
  label: 'Zendesk',
  admin: {
    description:
      'Import Zendesk tickets, comments, people, organizations and help-center articles, manage tickets, and react to ticket and user events',
    group: 'Customer Support',
  },
  auth: zendeskAuth,
  client: createZendeskClient,
  actions: [
    exportTickets,
    exportUsers,
    exportOrganizations,
    exportTicketEvents,
    exportArticles,
    listTicketComments,
    listGroups,
    listTicketFields,
    listUserFields,
    listOrganizationFields,
    listCategories,
    listSections,
    listMacros,
    listViews,
    listSlaPolicies,
    downloadAttachment,
    customApiCall,
  ],
});
