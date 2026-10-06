import { sqliteAdapter } from '@frogbotai/db-sqlite';
import {
  type CollectionConfig,
  type Field,
  type FieldHook,
  slugField,
  type TextField,
} from 'frogbot';
import type { TextField as PayloadTextField } from 'payload';

import { buildTestConfig, openAccess } from '../../__helpers/shared/buildTestConfig.js';
import {
  accessObservations,
  countRequests,
  databasePath,
  fieldArgumentsSlug,
  hookObservations,
  nestedFieldsSlug,
  observedBlockSlug,
  payloadHookObservations,
  postsSlug,
  usersSlug,
  validatorObservations,
} from './shared.js';

function recordHook(phase: string, recordArguments = false): FieldHook {
  return ({ blockData, field, global, indexPath, path, req, schemaPath, siblingFields, value }) => {
    hookObservations.push({
      field: field.name,
      phase,
      siblingNames: siblingFields?.flatMap((sibling) =>
        'name' in sibling && typeof sibling.name === 'string' ? [sibling.name] : [],
      ),
      ...(recordArguments
        ? {
            path: [...path],
            schemaPath: [...schemaPath],
            indexPath: [...indexPath],
            blockData: { ...blockData },
            globalIsNull: global === null,
            globalIsUndefined: global === undefined,
            fieldNameType: typeof field.name,
            hasFrogBot: Boolean(req.frogbot),
          }
        : {}),
    });

    return value;
  };
}

function observedText(name: string, recordArguments = false): TextField {
  return {
    name,
    type: 'text',
    hooks: {
      afterChange: [recordHook('afterChange', recordArguments)],
      afterRead: [recordHook('afterRead', recordArguments)],
      beforeChange: [recordHook('beforeChange', recordArguments)],
      beforeDuplicate: [recordHook('beforeDuplicate', recordArguments)],
      beforeValidate: [
        async ({ value }) => {
          await Promise.resolve();

          return typeof value === 'string' ? value.trim() : value;
        },
        recordHook('beforeValidate', recordArguments),
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
            context: req?.context,
            req,
            transactionID: req?.transactionID,
            userID: req?.user?.id,
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

const payloadAuthoredField: PayloadTextField = {
  name: 'payloadAuthored',
  type: 'text',
  hooks: {
    beforeChange: [
      ({ req, value }) => {
        payloadHookObservations.push(Boolean(req.payload));

        return value;
      },
    ],
  },
};

const FieldArguments: CollectionConfig = {
  slug: fieldArgumentsSlug,
  access: openAccess,
  fields: [
    {
      name: 'blocks',
      type: 'blocks',
      blocks: [
        {
          slug: observedBlockSlug,
          fields: [
            observedText('observed', true),
            {
              name: 'validated',
              type: 'text',
              minLength: 3,
              validate: (_value, { blockData, preferences, collectionSlug, minLength }) => {
                validatorObservations.push({
                  blockData: { ...blockData },
                  preferences,
                  collectionSlug,
                  minLength,
                });

                return true;
              },
            },
            {
              name: 'readable',
              type: 'text',
              access: {
                read: ({ blockData }) => {
                  accessObservations.push({ blockData: { ...blockData } });

                  return true;
                },
              },
            },
          ],
        },
      ],
    },
    payloadAuthoredField as Field,
  ],
};

export default await buildTestConfig({
  admin: { importMap: { autoGenerate: false } },
  collections: [
    { slug: usersSlug, auth: true, access: openAccess, fields: [] },
    Posts,
    NestedFields,
    FieldArguments,
  ],
  db: sqliteAdapter({ client: { url: `file:${databasePath}` }, transactionOptions: {} }),
});
