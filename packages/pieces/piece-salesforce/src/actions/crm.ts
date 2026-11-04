import { z } from 'zod';

import type { SalesforceClient } from '../client.js';
import { signal } from '../client.js';
import { dataRoot, extraFields, recordId } from '../config.js';
import { defineAction } from '../define.js';
import { changed, created, fieldValues } from '../records.js';
import { campaignStatusOptions, picklistOptions, recordOptions } from './options.js';

const text = (label: string) => z.string().meta({ label });

function create(
  client: SalesforceClient,
  object: string,
  body: Record<string, unknown>,
  abort?: AbortSignal,
) {
  return client.request(created, {
    method: 'POST',
    path: `${dataRoot}/sobjects/${object}`,
    body,
    signal: abort,
  });
}

async function update(
  client: SalesforceClient,
  object: string,
  id: string,
  body: Record<string, unknown>,
  abort?: AbortSignal,
) {
  if (Object.keys(body).length) {
    await client.send({
      method: 'PATCH',
      path: `${dataRoot}/sobjects/${object}/${id}`,
      body,
      signal: abort,
    });
  }

  return { id };
}

const accounts = recordOptions('Account');
const contacts = recordOptions('Contact');
const leads = recordOptions('Lead');
const users = recordOptions('User', 'IsActive = true');

export const createCase = defineAction({
  slug: 'createCase',
  description: 'Create a Case: a customer question, problem or request.',
  input: z.object({
    subject: text('Subject'),
    description: text('Description').optional(),
    status: text('Status').optional(),
    priority: text('Priority').optional(),
    origin: text('Origin').optional(),
    accountId: recordId('Account').optional(),
    contactId: recordId('Contact').optional(),
    fields: extraFields,
  }),
  output: created,
  idempotent: false,
  options: {
    status: picklistOptions('Case', 'Status'),
    priority: picklistOptions('Case', 'Priority'),
    origin: picklistOptions('Case', 'Origin'),
    accountId: accounts,
    contactId: contacts,
  },
  run({ client, input, req }) {
    const body = fieldValues(
      input,
      {
        subject: 'Subject',
        description: 'Description',
        status: 'Status',
        priority: 'Priority',
        origin: 'Origin',
        accountId: 'AccountId',
        contactId: 'ContactId',
      },
      input.fields,
    );

    return create(client, 'Case', body, signal(req));
  },
});

const contactNames = {
  firstName: 'FirstName',
  lastName: 'LastName',
  accountId: 'AccountId',
  email: 'Email',
  phone: 'Phone',
  title: 'Title',
};

export const createContact = defineAction({
  slug: 'createContact',
  description: 'Create a Contact, optionally under an Account.',
  input: z.object({
    lastName: text('Last name'),
    firstName: text('First name').optional(),
    accountId: recordId('Account').optional(),
    email: text('Email').optional(),
    phone: text('Phone').optional(),
    title: text('Title').optional(),
    fields: extraFields,
  }),
  output: created,
  idempotent: false,
  options: { accountId: accounts },
  run({ client, input, req }) {
    return create(client, 'Contact', fieldValues(input, contactNames, input.fields), signal(req));
  },
});

export const updateContact = defineAction({
  slug: 'updateContact',
  description: "Update a Contact's fields. Fields left out don't change.",
  input: z.object({
    contactId: recordId('Contact'),
    firstName: text('First name').optional(),
    lastName: text('Last name').optional(),
    accountId: recordId('Account').optional(),
    email: text('Email').optional(),
    phone: text('Phone').optional(),
    title: text('Title').optional(),
    fields: extraFields,
  }),
  output: changed,
  idempotent: true,
  options: { contactId: contacts, accountId: accounts },
  run({ client, input, req }) {
    const body = fieldValues(input, contactNames, input.fields);

    return update(client, 'Contact', input.contactId, body, signal(req));
  },
});

const leadNames = {
  firstName: 'FirstName',
  lastName: 'LastName',
  company: 'Company',
  email: 'Email',
  phone: 'Phone',
  leadSource: 'LeadSource',
};

const leadSources = picklistOptions('Lead', 'LeadSource');

export const createLead = defineAction({
  slug: 'createLead',
  description: 'Create a Lead.',
  input: z.object({
    lastName: text('Last name'),
    company: text('Company'),
    firstName: text('First name').optional(),
    email: text('Email').optional(),
    phone: text('Phone').optional(),
    leadSource: text('Lead source').optional(),
    fields: extraFields,
  }),
  output: created,
  idempotent: false,
  options: { leadSource: leadSources },
  run({ client, input, req }) {
    return create(client, 'Lead', fieldValues(input, leadNames, input.fields), signal(req));
  },
});

export const updateLead = defineAction({
  slug: 'updateLead',
  description: "Update a Lead's fields. Fields left out don't change; this doesn't convert it.",
  input: z.object({
    leadId: recordId('Lead'),
    firstName: text('First name').optional(),
    lastName: text('Last name').optional(),
    company: text('Company').optional(),
    email: text('Email').optional(),
    phone: text('Phone').optional(),
    leadSource: text('Lead source').optional(),
    fields: extraFields,
  }),
  output: changed,
  idempotent: true,
  options: { leadId: leads, leadSource: leadSources },
  run({ client, input, req }) {
    return update(
      client,
      'Lead',
      input.leadId,
      fieldValues(input, leadNames, input.fields),
      signal(req),
    );
  },
});

export const createNote = defineAction({
  slug: 'createNote',
  description: 'Add a classic Note to a record.',
  input: z.object({
    parentId: recordId('Record ID'),
    title: text('Title'),
    body: text('Body'),
  }),
  output: created,
  idempotent: false,
  run({ client, input, req }) {
    const body = { ParentId: input.parentId, Title: input.title, Body: input.body };

    return create(client, 'Note', body, signal(req));
  },
});

export const createOpportunity = defineAction({
  slug: 'createOpportunity',
  description: 'Create an Opportunity.',
  input: z.object({
    name: text('Name'),
    closeDate: z.iso.date().meta({ label: 'Close date', description: 'YYYY-MM-DD.' }),
    stageName: text('Stage'),
    accountId: recordId('Account').optional(),
    amount: z.number().optional().meta({ label: 'Amount' }),
    fields: extraFields,
  }),
  output: created,
  idempotent: false,
  options: { stageName: picklistOptions('Opportunity', 'StageName'), accountId: accounts },
  run({ client, input, req }) {
    const body = fieldValues(
      input,
      {
        name: 'Name',
        closeDate: 'CloseDate',
        stageName: 'StageName',
        accountId: 'AccountId',
        amount: 'Amount',
      },
      input.fields,
    );

    return create(client, 'Opportunity', body, signal(req));
  },
});

export const deleteOpportunity = defineAction({
  slug: 'deleteOpportunity',
  description: 'Delete an Opportunity. It goes to the Recycle Bin.',
  input: z.object({ opportunityId: recordId('Opportunity') }),
  output: changed,
  idempotent: false,
  options: { opportunityId: recordOptions('Opportunity') },
  async run({ client, input, req }) {
    await client.send({
      method: 'DELETE',
      path: `${dataRoot}/sobjects/Opportunity/${input.opportunityId}`,
      signal: signal(req),
    });

    return { id: input.opportunityId };
  },
});

export const createTask = defineAction({
  slug: 'createTask',
  description:
    'Create a Task, optionally about a Contact or Lead (whoId) and another record (whatId).',
  input: z.object({
    subject: text('Subject'),
    ownerId: recordId('Owner'),
    status: text('Status'),
    priority: text('Priority'),
    description: text('Description').optional(),
    whoId: recordId('Contact or Lead').optional(),
    whatId: recordId('Related record').optional(),
  }),
  output: created,
  idempotent: false,
  options: {
    ownerId: users,
    status: picklistOptions('Task', 'Status'),
    priority: picklistOptions('Task', 'Priority'),
  },
  run({ client, input, req }) {
    const body = fieldValues(input, {
      subject: 'Subject',
      ownerId: 'OwnerId',
      status: 'Status',
      priority: 'Priority',
      description: 'Description',
      whoId: 'WhoId',
      whatId: 'WhatId',
    });

    return create(client, 'Task', body, signal(req));
  },
});

const campaigns = recordOptions('Campaign');

export const addContactToCampaign = defineAction({
  slug: 'addContactToCampaign',
  description:
    'Add a Contact to a Campaign with a member status. A second add of the same Contact fails.',
  input: z.object({
    campaignId: recordId('Campaign'),
    contactId: recordId('Contact'),
    status: text('Member status'),
  }),
  output: created,
  idempotent: false,
  options: { campaignId: campaigns, contactId: contacts, status: campaignStatusOptions },
  run({ client, input, req }) {
    const body = { CampaignId: input.campaignId, ContactId: input.contactId, Status: input.status };

    return create(client, 'CampaignMember', body, signal(req));
  },
});

export const addLeadToCampaign = defineAction({
  slug: 'addLeadToCampaign',
  description:
    'Add a Lead to a Campaign with a member status. A second add of the same Lead fails.',
  input: z.object({
    campaignId: recordId('Campaign'),
    leadId: recordId('Lead'),
    status: text('Member status'),
  }),
  output: created,
  idempotent: false,
  options: { campaignId: campaigns, leadId: leads, status: campaignStatusOptions },
  run({ client, input, req }) {
    const body = { CampaignId: input.campaignId, LeadId: input.leadId, Status: input.status };

    return create(client, 'CampaignMember', body, signal(req));
  },
});

export const sendEmail = defineAction({
  slug: 'sendEmail',
  description:
    "Log an email to a Contact or Lead as a sent EmailMessage record, optionally related to another record. Salesforce records it on the activity timeline; it doesn't deliver it.",
  input: z.object({
    recipientId: recordId('Contact or Lead'),
    subject: text('Subject'),
    body: text('Body').meta({ description: 'Plain text or HTML.' }),
    relatedToId: recordId('Related record').optional(),
  }),
  output: created,
  idempotent: false,
  run({ client, input, req }) {
    const body = {
      ToIds: [input.recipientId],
      Subject: input.subject,
      HtmlBody: input.body,
      Status: '3',
      ...(input.relatedToId ? { RelatedToId: input.relatedToId } : {}),
    };

    return create(client, 'EmailMessage', body, signal(req));
  },
});
