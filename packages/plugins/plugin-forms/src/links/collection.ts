import type { CollectionConfig, FieldHook } from 'frogbot';
import { APIError, Forbidden } from 'payload';

import type { FormLinkDocument, FormLinkDuration, FormLinkStatus } from '../types.js';
import { FORM_LINKS_SLUG, isLinkCreate, linksAccess } from './access.js';
import { createFormLink } from './create.js';

const never = () => false;

export function linkStatus(
  link: Pick<FormLinkDocument, 'expiresAt' | 'maxSubmissions' | 'revokedAt' | 'submissions'>,
  now = new Date(),
): FormLinkStatus {
  if (link.revokedAt) return 'revoked';
  if (typeof link.maxSubmissions === 'number' && (link.submissions ?? 0) >= link.maxSubmissions) {
    return 'used up';
  }

  return new Date(link.expiresAt) > now ? 'active' : 'expired';
}

const fixed = { update: never };

const STATUS_FIELDS = ['expiresAt', 'maxSubmissions', 'revokedAt', 'submissions'] as const;

const readStatus: FieldHook = async ({ originalDoc, req, siblingData }) => {
  const row = { ...(originalDoc as object), ...(siblingData as object) } as Record<string, unknown>;

  if (STATUS_FIELDS.some((name) => row[name] === undefined) && isId(row.id)) {
    Object.assign(
      row,
      await req.frogbot.findByID({
        collection: FORM_LINKS_SLUG,
        id: row.id,
        select: Object.fromEntries(STATUS_FIELDS.map((name) => [name, true])),
        depth: 0,
        disableErrors: true,
        overrideAccess: true,
        req,
      }),
    );
  }

  return linkStatus(row as FormLinkDocument);
};

function isId(value: unknown): value is number | string {
  return typeof value === 'number' || (typeof value === 'string' && value !== '');
}

export function createFormLinksCollection({
  targets,
  access,
}: {
  targets: string[];
  access?: CollectionConfig['access'];
}): CollectionConfig {
  const manage = linksAccess(targets);

  return {
    slug: FORM_LINKS_SLUG,
    labels: { singular: 'Edit link', plural: 'Edit links' },
    disableDuplicate: true,
    versions: false,
    admin: {
      useAsTitle: 'label',
      description:
        'Links that let someone edit one record through one form. Revoke a link to stop it.',
      views: [
        {
          type: 'list',
          defaultFields: ['label', 'status', 'expiresAt', 'submissions', 'createdBy'],
          components: { menuItems: ['@frogbotai/plugin-forms/client#RevokeLinksMenuItem'] },
        },
      ],
    },
    access: {
      read: manage,
      update: manage,
      delete: manage,
      ...access,
      create: never,
    },
    endpoints: [
      {
        method: 'post',
        path: '/',
        handler: async (req) => {
          if (!req.user) {
            return Response.json({ error: 'Sign in to create links.' }, { status: 403 });
          }

          const body = (await req.json?.().catch(() => null)) as Record<string, unknown> | null;

          if (!body || typeof body !== 'object') {
            return Response.json({ error: 'The request body is invalid.' }, { status: 400 });
          }

          try {
            const link = await createFormLink(req.frogbot, {
              form: body.form as number | string,
              record: body.record as number | string,
              expiresIn: body.expiresIn as FormLinkDuration | undefined,
              maxSubmissions: body.maxSubmissions as number | null | undefined,
              req,
            });

            return Response.json(link, { status: 201 });
          } catch (error) {
            if (error instanceof APIError && error.status < 500) {
              const errors = (error.data as { errors?: unknown } | undefined)?.errors;

              return Response.json(
                { error: error.message, ...(errors ? { errors } : {}) },
                { status: error.status },
              );
            }

            throw error;
          }
        },
      },
    ],
    hooks: {
      beforeChange: [
        ({ operation, req }) => {
          if (operation === 'create' && !isLinkCreate(req)) throw new Forbidden(req.t);
        },
      ],
    },
    fields: [
      { name: 'label', type: 'text', access: fixed },
      {
        name: 'form',
        type: 'relationship',
        relationTo: 'forms',
        required: true,
        access: fixed,
      },
      {
        name: 'collection',
        type: 'select',
        options: targets,
        required: true,
        access: fixed,
      },
      {
        name: 'recordId',
        type: 'text',
        required: true,
        index: true,
        access: fixed,
      },
      {
        name: 'tokenHash',
        type: 'text',
        required: true,
        unique: true,
        index: true,
        hidden: true,
        access: fixed,
      },
      {
        name: 'status',
        type: 'text',
        virtual: true,
        admin: { readOnly: true },
        hooks: { afterRead: [readStatus] },
      },
      {
        name: 'expiresAt',
        type: 'date',
        required: true,
        access: fixed,
        admin: { date: { pickerAppearance: 'dayAndTime' } },
      },
      {
        name: 'maxSubmissions',
        type: 'number',
        min: 1,
        access: fixed,
        admin: { description: 'Empty: the link works until it expires.' },
      },
      {
        name: 'submissions',
        type: 'number',
        defaultValue: 0,
        access: fixed,
      },
      {
        name: 'lastSubmittedAt',
        type: 'date',
        access: fixed,
        admin: { date: { pickerAppearance: 'dayAndTime' } },
      },
      {
        name: 'revokedAt',
        type: 'date',
        admin: {
          position: 'sidebar',
          date: { pickerAppearance: 'dayAndTime' },
          description: 'Set to revoke the link. A revoked link stays revoked.',
        },
        hooks: { beforeChange: [({ previousValue, value }) => previousValue ?? value] },
      },
    ],
  };
}
