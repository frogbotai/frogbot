import type { Access, CollectionAccess, CollectionConfig } from 'frogbot';
import { ValidationError } from 'payload';

import { countKey } from './closing.js';
import { DEFAULT_CONFIRMATION } from './definition.js';
import { createDefinitionEndpoint, createSubmitEndpoint } from './endpoints.js';
import { FORM_LINKS_SLUG } from './links/access.js';
import type { FormsRuntime } from './lookup.js';
import { checkForm } from './questions.js';
import type { FormDocument } from './types.js';

export const FORMS_SLUG = 'forms';

const signedIn: Access = ({ req }) => Boolean(req.user);

export const RUNTIME_KEY = 'plugin-forms';

const FORM_BUILDER_FIELD = '@frogbotai/plugin-forms/rsc#FormBuilderField';

export function createFormsCollection({
  runtime,
  access,
}: {
  runtime: FormsRuntime;
  access?: CollectionAccess;
}): CollectionConfig {
  const { targets, uploads: limits } = runtime;

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
          const errors = await checkForm({ form, targets, req, limits });

          if (errors.length) throw new ValidationError({ collection: FORMS_SLUG, errors });

          return data;
        },
      ],
      beforeDelete: [
        async ({ id, req }) => {
          await req.frogbot.delete({
            collection: FORM_LINKS_SLUG,
            where: { form: { equals: id } },
            overrideAccess: true,
            req,
          });
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
        admin: { description: 'Each response creates or edits a record here.' },
      },
      {
        name: 'mode',
        type: 'select',
        required: true,
        defaultValue: 'create',
        options: [
          { label: 'Create records', value: 'create' },
          { label: 'Edit records through edit links', value: 'update' },
          { label: 'Both', value: 'both' },
        ],
        admin: {
          position: 'sidebar',
          description: 'Edit links open one record in this form, prefilled, for someone to change.',
        },
      },
      {
        type: 'tabs',
        tabs: [
          {
            label: 'Questions',
            fields: [
              {
                name: 'steps',
                type: 'array',
                required: true,
                minRows: 1,
                admin: { components: { Field: FORM_BUILDER_FIELD } },
                fields: [
                  { name: 'title', type: 'text', label: 'Step title' },
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
                      {
                        name: 'maxFileSize',
                        type: 'number',
                        min: 1,
                        admin: {
                          description:
                            "File questions: the largest file, in bytes. Defaults to the app's upload limit.",
                        },
                      },
                      {
                        name: 'maxFiles',
                        type: 'number',
                        min: 1,
                        max: 5,
                        admin: {
                          description: 'File questions: how many files, up to 5. Defaults to 1.',
                        },
                      },
                      {
                        name: 'mimeTypes',
                        type: 'text',
                        hasMany: true,
                        admin: {
                          description:
                            'File questions: accepted types, like application/pdf or image/*.',
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            label: 'Settings',
            fields: [
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
            ],
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
