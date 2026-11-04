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
  findAgent,
  findGroup,
  findLatestComment,
  findOrganization,
  findTickets,
  findUser,
} from './actions/find.js';
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
import { createOrganization, updateOrganization } from './actions/organizations.js';
import {
  addCommentToTicket,
  addTagToTicket,
  attachFileToTicket,
  createTicket,
  removeTagFromTicket,
  updateTicket,
} from './actions/tickets.js';
import { createUser, deleteUser, updateUser } from './actions/users.js';
import { createZendeskClient } from './client.js';
import { zendeskAuth } from './config.js';
import { groupCreated, suspendedTicketCreated, ticketInView } from './triggers/polling.js';
import {
  organizationCreated,
  ticketCommentAdded,
  ticketCreated,
  ticketTagAdded,
  ticketUpdated,
  userCreated,
  userTagAdded,
} from './triggers/webhook.js';

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
    createTicket,
    updateTicket,
    addTagToTicket,
    removeTagFromTicket,
    attachFileToTicket,
    addCommentToTicket,
    createOrganization,
    updateOrganization,
    createUser,
    updateUser,
    deleteUser,
    findOrganization,
    findTickets,
    findUser,
    findAgent,
    findGroup,
    findLatestComment,
    customApiCall,
  ],
  triggers: [
    ticketCreated,
    ticketUpdated,
    ticketTagAdded,
    ticketCommentAdded,
    organizationCreated,
    userCreated,
    userTagAdded,
    ticketInView,
    groupCreated,
    suspendedTicketCreated,
  ],
});
