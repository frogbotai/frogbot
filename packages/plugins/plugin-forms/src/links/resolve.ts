import { APIError, type FrogBotRequest } from 'frogbot';

import { createFormLinkContext, createFormSubmission } from '../access.js';
import { withLock } from '../closing.js';
import { definitionFor, findForm, type FormsRuntime, type FoundForm } from '../lookup.js';
import { checkRateLimit, clientIp, takeRateLimit } from '../spam.js';
import type { FormDefinition, FormDocument, FormLinkContext, FormLinkDocument } from '../types.js';
import { FORM_LINKS_SLUG } from './access.js';
import { linkStatus } from './collection.js';
import { hashLinkToken } from './token.js';

const TOKEN_MAX_LENGTH = 256;

export type ResolvedLink = { link: FormLinkDocument; context: FormLinkContext };

function formId(link: FormLinkDocument): string {
  return String(typeof link.form === 'object' ? link.form.id : link.form);
}

/** True when the link opens this form's record right now. */
export function linkWorks(link: FormLinkDocument, form: FormDocument, now = new Date()): boolean {
  return (
    formId(link) === String(form.id) &&
    link.collection === form.collection &&
    linkStatus(link, now) === 'active'
  );
}

/**
 * The link a token opens on this form, or `null` for every kind of failure: unknown, other
 * form, expired, revoked or used up. Callers answer them all the same way.
 */
export async function resolveLink(
  req: FrogBotRequest,
  form: FormDocument,
  token: unknown,
): Promise<ResolvedLink | null> {
  if (typeof token !== 'string' || !token || token.length > TOKEN_MAX_LENGTH) return null;
  if (form.mode !== 'update' && form.mode !== 'both') return null;

  const { docs } = await req.frogbot.find({
    collection: FORM_LINKS_SLUG,
    where: { tokenHash: { equals: hashLinkToken(token) } },
    limit: 1,
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req,
  });

  const link = docs[0] as FormLinkDocument | undefined;

  if (!link || !linkWorks(link, form)) return null;

  return {
    link,
    context: { id: link.id, collection: link.collection, record: link.recordId },
  };
}

/**
 * Runs `fn` with `req.context.formLink` (and `req.context.form`) set for this link, so the
 * target's wrapped `read` and `update` rules admit its record and nothing else.
 */
export async function asFormLink<T>(
  req: FrogBotRequest,
  form: FormDocument,
  { context }: ResolvedLink,
  fn: () => Promise<T>,
): Promise<T> {
  req.context.form = createFormSubmission(form, context.collection);
  req.context.formLink = createFormLinkContext(context);

  try {
    return await fn();
  } finally {
    delete req.context.form;
    delete req.context.formLink;
  }
}

/** The record's current answers to the form's questions, read through the link. */
export async function prefill(
  req: FrogBotRequest,
  form: FormDocument,
  resolved: ResolvedLink,
  keys: string[],
): Promise<Record<string, unknown>> {
  const doc = await asFormLink(req, form, resolved, () =>
    req.frogbot.findByID({
      collection: resolved.context.collection,
      id: resolved.context.record,
      select: Object.fromEntries(keys.map((key) => [key, true])),
      depth: 0,
      overrideAccess: false,
      req,
    }),
  );

  const record = doc as Record<string, unknown>;
  const values: Record<string, unknown> = {};

  for (const key of keys) {
    if (Object.hasOwn(record, key) && record[key] !== undefined) values[key] = record[key];
  }

  return values;
}

async function changeUses(
  req: FrogBotRequest,
  link: FormLinkDocument,
  data: Partial<FormLinkDocument>,
) {
  await req.frogbot.update({
    collection: FORM_LINKS_SLUG,
    id: link.id,
    data,
    depth: 0,
    overrideAccess: true,
    req,
  });
}

/**
 * Spends one use of the link, runs `save`, and gives the use back when `save` throws. The use is
 * checked and taken under a per-link lock, so concurrent submits never pass `maxSubmissions`.
 * Returns `null` when the link stopped working meanwhile.
 */
export async function spendUse<T>(
  req: FrogBotRequest,
  form: FormDocument,
  { link }: ResolvedLink,
  save: () => Promise<T>,
): Promise<{ result: T } | null> {
  const key = `plugin-forms:link:${link.id}`;
  const stamp = new Date().toISOString();

  const before = await withLock(req.frogbot, key, async () => {
    const current = (await req.frogbot.findByID({
      collection: FORM_LINKS_SLUG,
      id: link.id,
      depth: 0,
      disableErrors: true,
      overrideAccess: true,
      req,
    })) as FormLinkDocument | null;

    if (!current || !linkWorks(current, form)) return null;

    await changeUses(req, current, {
      submissions: (current.submissions ?? 0) + 1,
      lastSubmittedAt: stamp,
    });

    return current;
  });

  if (!before) return null;

  try {
    return { result: await save() };
  } catch (error) {
    await withLock(req.frogbot, key, async () => {
      const current = (await req.frogbot.findByID({
        collection: FORM_LINKS_SLUG,
        id: link.id,
        depth: 0,
        disableErrors: true,
        overrideAccess: true,
        req,
      })) as FormLinkDocument | null;

      if (!current) return;

      const ours =
        current.lastSubmittedAt &&
        new Date(current.lastSubmittedAt).getTime() === Date.parse(stamp);

      await changeUses(req, current, {
        submissions: Math.max(0, (current.submissions ?? 1) - 1),
        ...(ours ? { lastSubmittedAt: before.lastSubmittedAt ?? null } : {}),
      });
    }).catch((cause: unknown) => {
      req.frogbot.logger.error(
        { err: cause, link: link.id },
        '[plugin-forms] Could not give back an edit link use after a failed save',
      );
    });

    throw error;
  }
}

/**
 * The definition an edit link opens, prefilled with its record's answers, or `null` when the
 * form or the link doesn't work, or the record is gone.
 */
export async function openLink(
  req: FrogBotRequest,
  runtime: FormsRuntime,
  slug: unknown,
  token: unknown,
): Promise<{ found: FoundForm; definition: FormDefinition } | null> {
  const found = await findForm(req, runtime, slug);
  const resolved = found ? await resolveLink(req, found.form, token) : null;

  if (!found || !resolved) return null;

  try {
    const definition = await definitionFor(req, runtime, found, (keys) =>
      prefill(req, found.form, resolved, keys),
    );

    return { found, definition };
  } catch (error) {
    if (error instanceof APIError && (error.status === 403 || error.status === 404)) return null;

    throw error;
  }
}

export type LinkOpening =
  | { status: 'open'; found: FoundForm; definition: FormDefinition }
  | { status: 'gone' }
  | { status: 'limited'; retryAfter: number };

/**
 * `openLink` behind the per-visitor limit: with `trustProxy`, a visitor over the limit opens no
 * link, and each link that doesn't open counts toward it.
 */
export async function openLinkLimited(
  req: FrogBotRequest,
  runtime: FormsRuntime,
  slug: unknown,
  token: unknown,
): Promise<LinkOpening> {
  const { rateLimit, trustProxy } = runtime.spam;
  const ip = clientIp(req.headers, trustProxy);
  const limit = ip ? await checkRateLimit(req.frogbot, ip, rateLimit) : undefined;

  if (limit && !limit.allowed) return { status: 'limited', retryAfter: limit.retryAfter };

  const opened = await openLink(req, runtime, slug, token);

  if (opened) return { status: 'open', ...opened };
  if (ip) await takeRateLimit(req.frogbot, ip, rateLimit);

  return { status: 'gone' };
}
