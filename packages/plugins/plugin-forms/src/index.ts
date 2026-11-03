import { definePlugin, type Plugin } from 'frogbot';

import { wrapCreateAccess } from './access.js';
import { createFormsCollection, FORMS_SLUG } from './collection.js';
import { collectFields, type FormTarget } from './questions.js';
import type { FormsPluginOptions } from './types.js';

export { isFormSubmission } from './access.js';
export { FORMS_SLUG } from './collection.js';
export type {
  FormConfirmation,
  FormDefinition,
  FormDocument,
  FormFieldError,
  FormOption,
  FormQuestion,
  FormQuestionType,
  FormsPluginOptions,
  FormStep,
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

    if (config.collections.some(({ slug }) => slug === FORMS_SLUG)) {
      throw new Error(`[plugin-forms] Collection slug '${FORMS_SLUG}' already exists.`);
    }

    for (const slug of allowed) {
      if (!config.collections.some((collection) => collection.slug === slug)) {
        throw new Error(
          `[plugin-forms] Unknown collection '${slug}' in formsPlugin({ collections }).`,
        );
      }
    }

    const targets = new Map<string, FormTarget>();

    const collections = config.collections.map((collection) => {
      if (!allowed.has(collection.slug)) return collection;

      targets.set(collection.slug, {
        slug: collection.slug,
        fields: collectFields(collection.fields),
      });

      return {
        ...collection,
        access: {
          ...collection.access,
          create: wrapCreateAccess(collection.slug, collection.access?.create),
        },
      };
    });

    return {
      ...config,
      collections: [...collections, createFormsCollection({ targets, access: options.access })],
    };
  },
});

/**
 * Adds a `forms` collection whose forms create records in the listed collections, a public
 * definition endpoint (`GET /api/forms/:slug/definition`) and a submit endpoint
 * (`POST /api/forms/:slug/submit`).
 */
export function formsPlugin(options: FormsPluginOptions): Plugin {
  return forms(options);
}
