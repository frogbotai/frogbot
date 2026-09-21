import { sqliteAdapter } from '@frogbotai/db-sqlite';
import type { CollectionConfig, FieldHook, TextField } from 'frogbot';

import { slugField } from '../../../packages/frogbot/src/fields/baseFields/slug/index.js';
import { buildTestConfig, openAccess } from '../../__helpers/shared/buildTestConfig.js';
import {
  countRequests,
  databasePath,
  hookObservations,
  nestedFieldsSlug,
  postsSlug,
  usersSlug,
} from './shared.js';

function recordHook(phase: string): FieldHook {
  return ({ field, siblingFields, value }) => {
    hookObservations.push({
      field: field.name,
      phase,
      siblingNames: siblingFields?.flatMap((sibling) =>
        'name' in sibling && typeof sibling.name === 'string' ? [sibling.name] : [],
      ),
    });

    return value;
  };
}

function observedText(name: string): TextField {
  return {
    name,
    type: 'text',
    hooks: {
      afterChange: [recordHook('afterChange')],
      afterRead: [recordHook('afterRead')],
      beforeChange: [recordHook('beforeChange')],
      beforeDuplicate: [recordHook('beforeDuplicate')],
      beforeValidate: [
        async ({ value }) => {
          await Promise.resolve();

          return typeof value === 'string' ? value.trim() : value;
        },
        recordHook('beforeValidate'),
      ],
    },
  };
}

const Posts: CollectionConfig = {
  slug: postsSlug,
  access: openAccess,
  versions: { drafts: { autosave: true } },
  hooks: {
    beforeOperation: [
      ({ args, operation }) => {
        if (operation === 'countVersions') {
          const { req } = args;

          countRequests.push({
            context: req.context,
            req,
            transactionID: req.transactionID,
            userID: req.user?.id,
          });
        }

        return args;
      },
    ],
  },
  fields: [observedText('title'), slugField(), { name: 'note', type: 'text' }],
};

const NestedFields: CollectionConfig = {
  slug: nestedFieldsSlug,
  access: openAccess,
  fields: [{ name: 'group', type: 'group', fields: [observedText('value')] }],
};

export default await buildTestConfig({
  admin: { importMap: { autoGenerate: false } },
  collections: [
    { slug: usersSlug, auth: true, access: openAccess, fields: [] },
    Posts,
    NestedFields,
  ],
  db: sqliteAdapter({ client: { url: `file:${databasePath}` }, transactionOptions: {} }),
});
