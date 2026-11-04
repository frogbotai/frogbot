import type { FrogBot, FrogBotRequest } from 'frogbot';
import { getPayloadConfig } from 'frogbot/internal';
import { Forbidden, NotFound, ValidationError } from 'payload';
import { formatAdminURL } from 'payload/shared';

import { loadRuntime } from '../lookup.js';
import type { CreatedFormLink, CreateFormLinkOptions, FormDocument } from '../types.js';
import { asLinkCreate, canUpdateRecord, FORM_LINKS_SLUG } from './access.js';
import { createLinkToken, hashLinkToken, linkLifetime } from './token.js';

function refuse(req: FrogBotRequest, path: string, message: string): never {
  throw new ValidationError({ collection: FORM_LINKS_SLUG, errors: [{ path, message }] }, req.t);
}

function isId(value: unknown): value is number | string {
  return (typeof value === 'string' && value !== '') || Number.isInteger(value);
}

async function loadForm(
  req: FrogBotRequest,
  form: number | string,
): Promise<FormDocument | undefined> {
  if (typeof form === 'string') {
    const { docs } = await req.frogbot.find({
      collection: 'forms',
      where: { slug: { equals: form } },
      limit: 1,
      depth: 0,
      pagination: false,
      overrideAccess: true,
      req,
    });

    const found = docs[0] as FormDocument | undefined;

    if (found) return found;
  }

  try {
    const doc = await req.frogbot.findByID({
      collection: 'forms',
      id: form,
      depth: 0,
      disableErrors: true,
      overrideAccess: true,
      req,
    });

    return (doc ?? undefined) as FormDocument | undefined;
  } catch {
    return;
  }
}

async function linkURL(req: FrogBotRequest, slug: string, token: string): Promise<string> {
  const { serverURL, routes } = await getPayloadConfig(req.frogbot.config);
  let origin: string | undefined = serverURL;

  if (!origin && req.url) {
    try {
      origin = new URL(req.url).origin;
    } catch {
      origin = undefined;
    }
  }

  const page = formatAdminURL({
    adminRoute: routes.admin,
    path: `/forms/${encodeURIComponent(slug)}`,
    serverURL: origin,
    includeBasePath: true,
  });

  return `${page}?link=${token}`;
}

/**
 * Makes an edit link: a page where whoever holds the URL changes one record through one
 * `update` or `both` form. The token is random and only its hash is stored, so the URL is
 * returned once. Unless `overrideAccess`, the request's user must be able to update the record.
 *
 * @example
 * const { url } = await createFormLink(req.frogbot, { form: 'update-application', record: id, req });
 */
export async function createFormLink(
  frogbot: FrogBot,
  options: CreateFormLinkOptions,
): Promise<CreatedFormLink> {
  const { record, expiresIn, maxSubmissions, overrideAccess = false } = options;
  const req = options.req ?? (await frogbot.createRequest());
  const runtime = await loadRuntime(frogbot);

  if (!runtime) throw new Error('[plugin-forms] createFormLink needs formsPlugin in the config.');

  if (!isId(options.form)) refuse(req, 'form', 'Name the form by its slug or ID.');
  if (!isId(record)) refuse(req, 'record', 'Name the record by its ID.');

  const form = await loadForm(req, options.form);
  const target = form && runtime.targets.get(form.collection);

  if (!form || !target) throw new NotFound(req.t);

  if (form.mode !== 'update' && form.mode !== 'both') {
    refuse(req, 'form', `"${form.slug}" only creates records. Set its mode to update or both.`);
  }

  const lifetime = linkLifetime(expiresIn, runtime.links);

  if (typeof lifetime !== 'number') refuse(req, 'expiresIn', lifetime.error);

  if (
    maxSubmissions !== undefined &&
    maxSubmissions !== null &&
    (!Number.isInteger(maxSubmissions) || maxSubmissions < 1)
  ) {
    refuse(req, 'maxSubmissions', 'Use a whole number above 0, or leave it empty.');
  }

  if (!overrideAccess && !(await canUpdateRecord(req, target.slug, record))) {
    throw new Forbidden(req.t);
  }

  const exists = await frogbot.findByID({
    collection: target.slug,
    id: record,
    depth: 0,
    select: {},
    disableErrors: true,
    overrideAccess: true,
    req,
  });

  if (!exists) throw new NotFound(req.t);

  const token = createLinkToken();
  const expiresAt = new Date(Date.now() + lifetime * 1000).toISOString();

  const link = await asLinkCreate(req, () =>
    frogbot.create({
      collection: FORM_LINKS_SLUG,
      data: {
        label: `${form.title} · ${String(record)}`,
        form: form.id,
        collection: target.slug,
        recordId: String(record),
        tokenHash: hashLinkToken(token),
        expiresAt,
        maxSubmissions: maxSubmissions ?? null,
        submissions: 0,
      },
      depth: 0,
      overrideAccess: true,
      req,
    }),
  );

  return { url: await linkURL(req, form.slug, token), id: link.id, expiresAt };
}
