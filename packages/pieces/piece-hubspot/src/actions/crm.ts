import { z } from 'zod';

import { recordId } from '../config.js';
import {
  companies,
  contacts,
  customObjects,
  deals,
  lineItems,
  products,
  tickets,
} from '../objects.js';
import { createAction, findAction, getAction, type Named, updateAction } from './crud.js';
import { pipelineOptions, productOptions, stageOptions } from './options.js';

const pipelineFields = (pipeline: string, stage: string) => ({
  pipelineId: z.string().min(1).meta({ label: pipeline }),
  pipelineStageId: z.string().min(1).meta({ label: stage }),
});

const dealOptions = {
  pipelineId: pipelineOptions('deals'),
  pipelineStageId: stageOptions('deals'),
};

const ticketOptions = {
  pipelineId: pipelineOptions('tickets'),
  pipelineStageId: stageOptions('tickets'),
};

const dealNamed: Named = (input) => ({
  dealname: input.dealname,
  pipeline: input.pipelineId,
  dealstage: input.pipelineStageId,
});

const ticketNamed: Named = (input) => ({
  subject: input.ticketName,
  hs_pipeline: input.pipelineId,
  hs_pipeline_stage: input.pipelineStageId,
});

const lineItemNamed: Named = (input) => ({ hs_product_id: input.productId });

const dealFields = {
  dealname: z.string().min(1).meta({ label: 'Deal name' }),
  ...pipelineFields('Deal pipeline', 'Deal stage'),
};

const ticketFields = {
  ticketName: z.string().min(1).meta({ label: 'Ticket name' }),
  ...pipelineFields('Ticket pipeline', 'Ticket pipeline stage'),
};

const productField = { productId: recordId('Product ID') };

const contactId = { contactId: recordId('Contact ID') };
const companyId = { companyId: recordId('Company ID') };
const dealId = { dealId: recordId('Deal ID') };
const ticketId = { ticketId: recordId('Ticket ID') };
const lineItemId = { lineItemId: recordId('Line item ID') };
const productId = { productId: recordId('Product ID') };
const customObjectId = { customObjectId: recordId('Custom object ID') };

export const createContact = createAction({
  slug: 'createContact',
  description: 'Create a contact, then return it with its default and requested properties.',
  object: contacts,
  fields: {},
});

export const updateContact = updateAction({
  slug: 'updateContact',
  description: "Update a contact's properties, then return it.",
  object: contacts,
  id: contactId,
  fields: {},
});

export const getContact = getAction({
  slug: 'getContact',
  description: 'Get a contact by ID.',
  object: contacts,
  id: contactId,
});

export const findContact = findAction({
  slug: 'findContact',
  description:
    'Find contacts whose properties equal one or two values, up to 200. Search stops at 10,000 results; use listRecords to read every contact.',
  object: contacts,
});

export const createCompany = createAction({
  slug: 'createCompany',
  description: 'Create a company, then return it with its default and requested properties.',
  object: companies,
  fields: {},
});

export const updateCompany = updateAction({
  slug: 'updateCompany',
  description: "Update a company's properties, then return it.",
  object: companies,
  id: companyId,
  fields: {},
});

export const getCompany = getAction({
  slug: 'getCompany',
  description: 'Get a company by ID.',
  object: companies,
  id: companyId,
});

export const findCompany = findAction({
  slug: 'findCompany',
  description: 'Find companies whose properties equal one or two values, up to 200.',
  object: companies,
});

export const createDeal = createAction({
  slug: 'createDeal',
  description: 'Create a deal in a pipeline stage, then return it.',
  object: deals,
  fields: dealFields,
  named: dealNamed,
  options: dealOptions,
});

export const updateDeal = updateAction({
  slug: 'updateDeal',
  description: "Update a deal's name, pipeline, stage or other properties, then return it.",
  object: deals,
  id: dealId,
  fields: {
    dealname: dealFields.dealname.optional(),
    pipelineId: dealFields.pipelineId.optional(),
    pipelineStageId: dealFields.pipelineStageId.optional(),
  },
  named: dealNamed,
  options: dealOptions,
});

export const getDeal = getAction({
  slug: 'getDeal',
  description: 'Get a deal by ID.',
  object: deals,
  id: dealId,
});

export const findDeal = findAction({
  slug: 'findDeal',
  description: 'Find deals whose properties equal one or two values, up to 200.',
  object: deals,
});

export const createTicket = createAction({
  slug: 'createTicket',
  description: 'Create a ticket in a pipeline stage, then return it.',
  object: tickets,
  fields: ticketFields,
  named: ticketNamed,
  options: ticketOptions,
});

export const updateTicket = updateAction({
  slug: 'updateTicket',
  description: "Update a ticket's name, pipeline, stage or other properties, then return it.",
  object: tickets,
  id: ticketId,
  fields: {
    ticketName: ticketFields.ticketName.optional(),
    pipelineId: ticketFields.pipelineId.optional(),
    pipelineStageId: ticketFields.pipelineStageId.optional(),
  },
  named: ticketNamed,
  options: ticketOptions,
});

export const getTicket = getAction({
  slug: 'getTicket',
  description: 'Get a ticket by ID.',
  object: tickets,
  id: ticketId,
});

export const findTicket = findAction({
  slug: 'findTicket',
  description: 'Find tickets whose properties equal one or two values, up to 200.',
  object: tickets,
});

export const createLineItem = createAction({
  slug: 'createLineItem',
  description: 'Create a line item for a product, then return it.',
  object: lineItems,
  fields: productField,
  named: lineItemNamed,
  options: { productId: productOptions },
});

export const updateLineItem = updateAction({
  slug: 'updateLineItem',
  description: "Update a line item's product or other properties, then return it.",
  object: lineItems,
  id: lineItemId,
  fields: { productId: productField.productId.optional() },
  named: lineItemNamed,
  options: { productId: productOptions },
});

export const getLineItem = getAction({
  slug: 'getLineItem',
  description: 'Get a line item by ID.',
  object: lineItems,
  id: lineItemId,
});

export const findLineItem = findAction({
  slug: 'findLineItem',
  description: 'Find line items whose properties equal one or two values, up to 200.',
  object: lineItems,
});

export const createProduct = createAction({
  slug: 'createProduct',
  description: 'Create a product, then return it.',
  object: products,
  fields: {},
});

export const updateProduct = updateAction({
  slug: 'updateProduct',
  description: "Update a product's properties, then return it.",
  object: products,
  id: productId,
  fields: {},
});

export const getProduct = getAction({
  slug: 'getProduct',
  description: 'Get a product by ID.',
  object: products,
  id: productId,
});

export const findProduct = findAction({
  slug: 'findProduct',
  description: 'Find products whose properties equal one or two values, up to 200.',
  object: products,
});

export const createCustomObject = createAction({
  slug: 'createCustomObject',
  description: 'Create a custom object record, then return it.',
  object: customObjects,
  fields: {},
});

export const updateCustomObject = updateAction({
  slug: 'updateCustomObject',
  description: "Update a custom object record's properties, then return it.",
  object: customObjects,
  id: customObjectId,
  fields: {},
});

export const getCustomObject = getAction({
  slug: 'getCustomObject',
  description: 'Get a custom object record by ID.',
  object: customObjects,
  id: customObjectId,
});

export const findCustomObject = findAction({
  slug: 'findCustomObject',
  description: 'Find custom object records whose properties equal one or two values, up to 200.',
  object: customObjects,
});
