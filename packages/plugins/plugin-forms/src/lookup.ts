import type { FrogBotRequest } from 'frogbot';

import { formIsClosed } from './closing.js';
import { buildDefinition } from './definition.js';
import type { FormTarget } from './questions.js';
import { HONEYPOT_FIELD, type SpamOptions } from './spam.js';
import type { FormDefinition, FormDocument } from './types.js';

/** What the endpoints and the page share, kept on the `forms` collection's `custom['plugin-forms']`. */
export type FormsRuntime = {
  targets: Map<string, FormTarget>;
  spam: SpamOptions;
};

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

export async function definitionFor(
  req: FrogBotRequest,
  runtime: FormsRuntime,
  { form, target }: FoundForm,
): Promise<FormDefinition> {
  const { turnstile } = runtime.spam;

  return {
    ...buildDefinition({
      form,
      fields: target.fields,
      closed: await formIsClosed(req.frogbot, form),
      language: req.i18n?.language,
    }),
    honeypot: HONEYPOT_FIELD,
    ...(turnstile ? { turnstile: { siteKey: turnstile.siteKey } } : {}),
  };
}
