import { definePlugin, type OnInit, type Plugin } from 'frogbot';
import type { AdminViewConfig } from 'payload';

import { wrapCreateAccess } from './access.js';
import { createFormsCollection, FORMS_SLUG } from './collection.js';
import { FORM_LINKS_SLUG } from './links/access.js';
import { createFormLinksCollection } from './links/collection.js';
import { resolveLinkLimits } from './links/token.js';
import type { FormsRuntime } from './lookup.js';
import { collectFields, type FormTarget } from './questions.js';
import { resolveSpamOptions, spamWarnings } from './spam.js';
import type { FormsPluginOptions } from './types.js';
import { resolveUploadLimits, uploadWarnings } from './uploads.js';

const FORM_VIEW: AdminViewConfig = {
  Component: '@frogbotai/plugin-forms/rsc#FormView',
  exact: false,
  path: '/forms',
  meta: { title: 'Form' },
};

export { isFormSubmission } from './access.js';
export { FORMS_SLUG } from './collection.js';
export { FORM_LINKS_SLUG } from './links/access.js';
export { createFormLink } from './links/create.js';
export type {
  CreatedFormLink,
  CreateFormLinkOptions,
  FormConfirmation,
  FormDefinition,
  FormDocument,
  FormFieldError,
  FormLinkContext,
  FormLinkDocument,
  FormLinkDuration,
  FormLinkStatus,
  FormMode,
  FormOption,
  FormQuestion,
  FormQuestionType,
  FormsLinksOptions,
  FormsPluginOptions,
  FormsRateLimitOptions,
  FormStep,
  FormsTurnstileOptions,
  FormSubmission,
  FormSubmitBody,
  FormSubmitResponse,
} from './types.js';

declare module 'frogbot' {
  interface RegisteredPlugins {
    'plugin-forms': FormsPluginOptions;
  }
}

const forms = definePlugin<FormsPluginOptions>({
  slug: 'plugin-forms',
  order: 200,
  plugin: ({ config, options }) => {
    const allowed = new Set<string>(options.collections);

    if (allowed.size === 0) {
      throw new Error(
        '[plugin-forms] List at least one collection in formsPlugin({ collections }).',
      );
    }

    for (const taken of [FORMS_SLUG, FORM_LINKS_SLUG]) {
      if (config.collections.some(({ slug }) => slug === taken)) {
        throw new Error(`[plugin-forms] Collection slug '${taken}' already exists.`);
      }
    }

    for (const slug of allowed) {
      if (!config.collections.some((collection) => collection.slug === slug)) {
        throw new Error(
          `[plugin-forms] Unknown collection '${slug}' in formsPlugin({ collections }).`,
        );
      }
    }

    const spam = resolveSpamOptions(options);
    const targets = new Map<string, FormTarget>();

    const collections = config.collections.map((collection) => {
      if (!allowed.has(collection.slug)) return collection;

      targets.set(collection.slug, {
        slug: collection.slug,
        fields: collectFields(collection.fields),
        upload: Boolean(collection.upload),
        drafts: typeof collection.versions === 'object' && Boolean(collection.versions.drafts),
      });

      return {
        ...collection,
        access: {
          ...collection.access,
          create: wrapCreateAccess(collection.slug, collection.access?.create),
        },
      };
    });

    const runtime: FormsRuntime = {
      targets,
      spam,
      uploads: resolveUploadLimits(config),
      links: resolveLinkLimits(options.links),
    };

    const warnings = [
      ...spamWarnings(spam),
      ...uploadWarnings(config.collections.filter(({ slug }) => allowed.has(slug))),
    ];

    const warn: OnInit = (frogbot) => {
      for (const warning of warnings) frogbot.logger.warn(warning);
    };

    return {
      ...config,
      collections: [
        ...collections,
        createFormsCollection({ runtime, access: options.access }),
        createFormLinksCollection({ targets: [...allowed], access: options.links?.access }),
      ],
      admin: {
        ...config.admin,
        components: {
          ...config.admin?.components,
          views: { ...config.admin?.components?.views, form: FORM_VIEW },
        },
      },
      ...(warnings.length
        ? { onInit: [...(config.onInit === undefined ? [] : [config.onInit].flat()), warn] }
        : {}),
    };
  },
});

/**
 * Adds a `forms` collection whose forms create records in the listed collections, a public page
 * at `/forms/<slug>`, a definition endpoint (`GET /api/forms/:slug/definition`) and a submit
 * endpoint (`POST /api/forms/:slug/submit`) with a honeypot, optional Turnstile and a per-visitor
 * rate limit. File questions store visitors' files in listed upload collections. Forms in the
 * `update` or `both` mode edit one record through edit links that `createFormLink` makes.
 */
export function formsPlugin(options: FormsPluginOptions): Plugin {
  return forms(options);
}
