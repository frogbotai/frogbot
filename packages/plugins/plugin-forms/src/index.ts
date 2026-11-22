import { definePlugin, type OnInit, type Plugin } from 'frogbot';
import type { AdminViewConfig } from 'payload';

import { wrapCreateAccess, wrapLinkAccess } from './access.js';
import { createFormsCollection, FORMS_SLUG } from './collection.js';
import { createEmbedEndpoints, resolveFrameAncestors } from './embed/endpoints.js';
import { FORM_LINKS_SLUG } from './links/access.js';
import { createFormLinksCollection } from './links/collection.js';
import { resolveLinkLimits } from './links/token.js';
import type { FormsRuntime } from './lookup.js';
import { collectFields, type FormTarget } from './questions.js';
import { resolveSpamOptions, spamWarnings } from './spam.js';
import { createFormStatsCollection, FORM_STATS_SLUG } from './stats.js';
import type { FormsPluginOptions } from './types.js';
import { resolveUploadLimits, uploadWarnings } from './uploads.js';

const EDIT_LINK_MENU_ITEM = '@frogbotai/plugin-forms/client#EditLinkMenuItem';

const FORM_VIEW: AdminViewConfig = {
  Component: '@frogbotai/plugin-forms/rsc#FormView',
  exact: false,
  path: '/forms',
  meta: { title: 'Form' },
};

const PREVIEW_PATH = '/forms-preview';

const PREVIEW_VIEW: AdminViewConfig = {
  Component: '@frogbotai/plugin-forms/rsc#FormPreviewView',
  exact: true,
  path: PREVIEW_PATH,
  meta: { title: 'Form preview' },
};

export { isFormSubmission } from './access.js';
export { FORMS_SLUG } from './collection.js';
export type { EmbedMessage } from './embed/messages.js';
export { FORM_LINKS_SLUG } from './links/access.js';
export { createFormLink } from './links/create.js';
export { FORM_STATS_SLUG } from './stats.js';
export type {
  CreatedFormLink,
  CreateFormLinkOptions,
  FormConfirmation,
  FormDefinition,
  FormDocument,
  FormEvent,
  FormFieldError,
  FormIgnoredAnswer,
  FormLinkContext,
  FormLinkDocument,
  FormLinkDuration,
  FormLinkStatus,
  FormMode,
  FormOption,
  FormQuestion,
  FormQuestionType,
  FormRule,
  FormRuleMatch,
  FormRuleOperator,
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

    for (const taken of [
      FORMS_SLUG,
      FORM_LINKS_SLUG,
      ...(options.analytics ? [FORM_STATS_SLUG] : []),
    ]) {
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

    const adminRoute = config.routes?.admin ?? '/';
    const apiRoute = (config.routes?.api ?? '/api').replace(/\/+$/, '');
    const frameAncestors = resolveFrameAncestors(options.frameAncestors);
    const spam = resolveSpamOptions(options);
    const links = resolveLinkLimits(options.links);
    const targets = new Map<string, FormTarget>();

    const collections = config.collections.map((collection) => {
      if (!allowed.has(collection.slug)) return collection;

      targets.set(collection.slug, {
        slug: collection.slug,
        fields: collectFields(collection.fields),
        upload: Boolean(collection.upload),
        drafts: typeof collection.versions === 'object' && Boolean(collection.versions.drafts),
      });

      const edit = collection.admin?.components?.edit;

      return {
        ...collection,
        ...(collection.upload
          ? {}
          : {
              admin: {
                ...collection.admin,
                components: {
                  ...collection.admin?.components,
                  edit: {
                    ...edit,
                    editMenuItems: [
                      ...(edit?.editMenuItems ?? []),
                      { path: EDIT_LINK_MENU_ITEM, clientProps: links },
                    ],
                  },
                },
              },
            }),
        access: {
          ...collection.access,
          create: wrapCreateAccess(collection.slug, collection.access?.create),
          read: wrapLinkAccess(collection.slug, collection.access?.read),
          update: wrapLinkAccess(collection.slug, collection.access?.update),
        },
      };
    });

    const runtime: FormsRuntime = {
      targets,
      spam,
      uploads: resolveUploadLimits(config),
      links,
      analytics: options.analytics === true,
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
        createFormsCollection({
          runtime,
          access: options.access,
          previewUrl: `${adminRoute === '/' ? '' : adminRoute}${PREVIEW_PATH}`,
          embed: createEmbedEndpoints({
            runtime,
            frameAncestors,
            base: `${apiRoute}/${FORMS_SLUG}`,
          }),
        }),
        createFormLinksCollection({ targets: [...allowed], access: options.links?.access }),
        ...(runtime.analytics ? [createFormStatsCollection()] : []),
      ],
      admin: {
        ...config.admin,
        components: {
          ...config.admin?.components,
          views: {
            ...config.admin?.components?.views,
            form: FORM_VIEW,
            formPreview: PREVIEW_VIEW,
          },
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
 * rate limit. `<script src="/api/forms/<slug>/embed.js">` embeds a form on the `frameAncestors`
 * origins, in an iframe that resizes to fit. File questions store visitors' files in listed upload
 * collections. Forms in the `update` or `both` mode edit one record through edit links that
 * `createFormLink` makes. With `analytics`, a `form-stats` collection counts views, starts and
 * completions per form per day.
 */
export function formsPlugin(options: FormsPluginOptions): Plugin {
  return forms(options);
}
