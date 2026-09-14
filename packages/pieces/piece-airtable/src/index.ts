import { definePiece, type PieceDefinition } from 'frogbot/pieces';

import { customApiCall } from './actions/customApiCall.js';
import {
  addRecordComment,
  cleanRecord,
  createRecord,
  deleteRecord,
  findRecords,
  getRecord,
  updateRecord,
  uploadAttachment,
} from './actions/records.js';
import {
  createBase,
  createTable,
  findBases,
  findTable,
  getBaseSchema,
  getTable,
} from './actions/schema.js';
import { createAirtableClient } from './client.js';
import { airtableAuth } from './config.js';
import type { AirtableTypes } from './piece-types.js';
import { newOrUpdatedRecord, newRecord } from './triggers/records.js';

export const airtableActions = [
  'createRecord',
  'findRecords',
  'updateRecord',
  'cleanRecord',
  'deleteRecord',
  'uploadAttachment',
  'addRecordComment',
  'createBase',
  'createTable',
  'findBases',
  'getTable',
  'getRecord',
  'findTable',
  'getBaseSchema',
  'customApiCall',
] as const;

export const airtableTriggers = ['newRecord', 'newOrUpdatedRecord'] as const;

export const createAirtable = definePiece({
  slug: 'airtable',
  label: 'Airtable',
  admin: {
    description: 'Create, find, and update Airtable records and schemas',
    group: 'Productivity',
  },
  auth: airtableAuth,
  client: createAirtableClient,
  actions: [
    createRecord,
    findRecords,
    updateRecord,
    cleanRecord,
    deleteRecord,
    uploadAttachment,
    addRecordComment,
    createBase,
    createTable,
    findBases,
    getTable,
    getRecord,
    findTable,
    getBaseSchema,
    customApiCall,
  ],
  triggers: [newRecord, newOrUpdatedRecord],
} satisfies PieceDefinition<AirtableTypes, ReturnType<typeof createAirtableClient>>);
