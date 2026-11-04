import type { Access, FrogBotRequest } from 'frogbot';
import { getPayloadConfig } from 'frogbot/internal';

import type { FormDocument, FormLinkContext, FormSubmission } from './types.js';

const submissions = new WeakSet<object>();
const links = new WeakSet<object>();

/** Marks `req.context.formLink` as one the plugin set, so only the plugin can admit a link. */
export function createFormLinkContext(link: FormLinkContext): FormLinkContext {
  const context = Object.freeze({ id: link.id, collection: link.collection, record: link.record });
  links.add(context);

  return context;
}

/** The request's edit link when the plugin set it for `collection`, else `undefined`. */
export function formLinkFor(
  req: Pick<FrogBotRequest, 'context'>,
  collection: string,
): FormLinkContext | undefined {
  const value: unknown = req.context?.formLink;

  if (typeof value !== 'object' || value === null || !links.has(value)) return;

  const link = value as FormLinkContext;

  return link.collection === collection ? link : undefined;
}

export function createFormSubmission(form: FormDocument, collection: string): FormSubmission {
  const submission = Object.freeze({ form, collection });
  submissions.add(submission);

  return submission;
}

/**
 * True while a form submission creates its record. Pass `collection` to also check that the
 * submission targets that collection. The flag can't be forged: only the plugin's submit
 * endpoint makes one.
 *
 * @example
 * access: { create: ({ req }) => isFormSubmission(req, 'leads') || Boolean(req.user) }
 */
export function isFormSubmission(
  req: Pick<FrogBotRequest, 'context'>,
  collection?: string,
): boolean {
  const value: unknown = req.context?.form;

  if (typeof value !== 'object' || value === null || !submissions.has(value)) return false;

  return collection === undefined || (value as FormSubmission).collection === collection;
}

const adminUsers: Access = async ({ req }) => {
  if (!req.user) return false;

  const { admin } = await getPayloadConfig(req.frogbot.config);

  return req.user.collection === admin.user;
};

/** Wraps a collection's `access.create` as `isFormSubmission(req, slug) || create(args)`. */
export function wrapCreateAccess(slug: string, create: Access | undefined): Access {
  const fallback = create ?? adminUsers;

  return (args) => (isFormSubmission(args.req, slug) ? true : fallback(args));
}

/**
 * Wraps a collection's `access.read` or `access.update`: while an edit link for this collection
 * runs, only its record; otherwise the collection's own rule.
 */
export function wrapLinkAccess(slug: string, rule: Access | undefined): Access {
  const fallback = rule ?? adminUsers;

  return (args) => {
    const link = formLinkFor(args.req, slug);

    return link ? { id: { equals: link.record } } : fallback(args);
  };
}
