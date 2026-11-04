import type { Access, CollectionAccess, CollectionConfig } from 'frogbot';
import { ValidationError } from 'payload';

import { countKey } from './closing.js';
import { DEFAULT_CONFIRMATION } from './definition.js';
import { createDefinitionEndpoint, createSubmitEndpoint } from './endpoints.js';
import type { FormsRuntime } from './lookup.js';
import { checkForm } from './questions.js';
import type { FormDocument } from './types.js';

export const FORMS_SLUG = 'forms';

const signedIn: Access = ({ req }) => Boolean(req.user);

export const RUNTIME_KEY = 'plugin-forms';

export function createFormsCollection({
  runtime,
  access,
}: {
  runtime: FormsRuntime;
  access?: CollectionAccess;
}): CollectionConfig {
  const { targets } = runtime;

  return {
    slug: FORMS_SLUG,
    custom: { [RUNTIME_KEY]: runtime },
    admin: {
      useAsTitle: 'title',
      views: [{ type: 'list', defaultFields: ['title', 'slug', 'collection', 'status'] }],
    },
    access: {
      read: () => true,
      create: signedIn,
      update: signedIn,
      delete: signedIn,
      ...access,
    },
    endpoints: [createDefinitionEndpoint(runtime), createSubmitEndpoint(runtime)],
    hooks: {
      beforeValidate: [
        async ({ data, originalDoc, req }) => {
          const form = { ...originalDoc, ...data } as Partial<FormDocument>;
          const errors = await checkForm({ form, targets, req });

          if (errors.length) throw new ValidationError({ collection: FORMS_SLUG, errors });

          return data;
        },
      ],
      afterDelete: [
        async ({ doc, req }) => {
          await req.frogbot.kv.delete(countKey(doc as FormDocument));
        },
      ],
    },
    fields: [
      { name: 'title', type: 'text', required: true },
      {
        name: 'slug',
        type: 'text',
        required: true,
        unique: true,
        index: true,
        admin: { description: 'The form is at /forms/<slug>.' },
      },
      {
        name: 'collection',
        type: 'select',
        required: true,
        options: [...targets.keys()],
        admin: { description: 'Each response creates a record here.' },
      },
      {
        name: 'steps',
        type: 'array',
        required: true,
        minRows: 1,
        fields: [
          { name: 'title', type: 'text' },
          {
            name: 'questions',
            type: 'array',
            required: true,
            minRows: 1,
            fields: [
              {
                name: 'field',
                type: 'text',
                required: true,
                admin: { description: 'The name of a field in the collection.' },
              },
              { name: 'label', type: 'text' },
              { name: 'description', type: 'textarea' },
              { name: 'placeholder', type: 'text' },
            ],
          },
        ],
      },
      {
        name: 'hiddenParams',
        type: 'array',
        admin: {
          description:
            'URL parameters, like utm_source, saved to a text field of the record. Others are dropped.',
        },
        fields: [
          { name: 'name', type: 'text', required: true },
          { name: 'field', type: 'text', required: true },
        ],
      },
      {
        name: 'confirmation',
        type: 'group',
        fields: [
          {
            name: 'type',
            type: 'radio',
            options: ['message', 'redirect'],
            defaultValue: 'message',
          },
          {
            name: 'message',
            type: 'textarea',
            defaultValue: DEFAULT_CONFIRMATION,
            admin: { condition: (_, sibling) => sibling?.type !== 'redirect' },
          },
          {
            name: 'redirect',
            type: 'text',
            admin: {
              condition: (_, sibling) => sibling?.type === 'redirect',
              description: 'A path like /thanks, or an http(s) URL.',
            },
          },
        ],
      },
      {
        name: 'status',
        type: 'select',
        options: ['open', 'closed'],
        defaultValue: 'open',
        required: true,
        admin: { position: 'sidebar' },
      },
      {
        name: 'closesAt',
        type: 'date',
        admin: { position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } },
      },
      {
        name: 'maxResponses',
        type: 'number',
        min: 1,
        admin: { position: 'sidebar', step: 1 },
      },
    ],
  };
}
