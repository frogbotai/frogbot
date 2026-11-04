import type { FrogBot, FrogBotRequest } from 'frogbot';
import { getPayloadConfig } from 'frogbot/internal';

import { formIsClosed, isClosed } from './closing.js';
import { buildDefinition } from './definition.js';
import type { LinkLimits } from './links/token.js';
import type { FormTarget } from './questions.js';
import { HONEYPOT_FIELD, type SpamOptions } from './spam.js';
import type { FormDefinition, FormDocument } from './types.js';
import type { UploadLimits } from './uploads.js';

/** What the endpoints and the page share, kept on the `forms` collection's `custom['plugin-forms']`. */
export type FormsRuntime = {
  targets: Map<string, FormTarget>;
  spam: SpamOptions;
  uploads: UploadLimits;
  links: LinkLimits;
};

/** The runtime the plugin put on the `forms` collection. */
export async function loadRuntime(frogbot: FrogBot): Promise<FormsRuntime | undefined> {
  const config = await getPayloadConfig(frogbot.config);
  const forms = config.collections.find(({ slug }) => slug === 'forms');

  return forms?.custom?.['plugin-forms'] as FormsRuntime | undefined;
}

export type FoundForm = {
  form: FormDocument;
  target: FormTarget;
};

/** Loads a form by slug as the visitor, so the `forms` `read` rule decides. */
export async function findForm(
  req: FrogBotRequest,
  runtime: FormsRuntime,
  slug: unknown,
): Promise<FoundForm | undefined> {
  if (typeof slug !== 'string' || !slug) return;

  const result = await req.frogbot.find({
    collection: 'forms',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
    pagination: false,
    disableErrors: true,
    overrideAccess: false,
    req,
  });

  const form = result.docs[0] as FormDocument | undefined;
  const target = form && runtime.targets.get(form.collection);

  return form && target ? { form, target } : undefined;
}

/**
 * The render definition. Through an edit link (`values`), it carries the record's answers and no
 * URL parameters, and `maxResponses` doesn't close it, since it counts new records only.
 */
export async function definitionFor(
  req: FrogBotRequest,
  runtime: FormsRuntime,
  { form, target }: FoundForm,
  values?: (keys: string[]) => Promise<Record<string, unknown>>,
): Promise<FormDefinition> {
  const { turnstile } = runtime.spam;
  const definition = buildDefinition({
    form,
    fields: target.fields,
    closed: values ? isClosed(form, 0) : await formIsClosed(req.frogbot, form),
    language: req.i18n?.language,
    limits: runtime.uploads,
  });

  const keys = definition.steps.flatMap(({ questions }) =>
    questions.flatMap(({ key, type }) => (type === 'upload' ? [] : [key])),
  );

  return {
    ...definition,
    ...(values ? { hiddenParams: [], values: await values(keys) } : {}),
    honeypot: HONEYPOT_FIELD,
    ...(turnstile ? { turnstile: { siteKey: turnstile.siteKey } } : {}),
  };
}
