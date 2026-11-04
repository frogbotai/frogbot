import { addDataAndFileToRequest, APIError, type Endpoint, KVLockContentionError } from 'frogbot';

import { createFormSubmission } from './access.js';
import { countResponse, formIsClosed } from './closing.js';
import { buildConfirmation } from './definition.js';
import { definitionFor, findForm, type FormsRuntime } from './lookup.js';
import type { FormTarget, QuestionField } from './questions.js';
import { clientIp, takeRateLimit, verifyTurnstile } from './spam.js';
import type { FormDocument, FormFieldError, FormSubmitResponse } from './types.js';

export const PARAM_MAX_LENGTH = 500;

const notFound = () =>
  Response.json({ error: 'Not found' } satisfies FormSubmitResponse, { status: 404 });

const closed = () =>
  Response.json({ error: 'This form is closed.' } satisfies FormSubmitResponse, { status: 410 });

const failure = (status: number, error: string, headers?: HeadersInit) =>
  Response.json({ error } satisfies FormSubmitResponse, { status, headers });

const busy = () => failure(503, 'This form is busy. Try again.');

const confirmed = (form: FormDocument) =>
  Response.json({ confirmation: buildConfirmation(form) } satisfies FormSubmitResponse);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanAnswer(field: QuestionField, value: unknown): unknown {
  if (value === null || value === undefined || value === '') return;

  if (field.type === 'checkbox') return typeof value === 'boolean' ? value : undefined;

  if (field.type === 'number') {
    const number = typeof value === 'string' && value.trim() ? Number(value) : value;

    return typeof number === 'number' && Number.isFinite(number) ? number : undefined;
  }

  if (field.type === 'select' && field.hasMany) {
    return Array.isArray(value) && value.every((item) => typeof item === 'string')
      ? value
      : undefined;
  }

  return typeof value === 'string' ? value : undefined;
}

/** Keeps the answers to the form's questions and its declared parameters; drops everything else. */
export function pickSubmission(
  form: FormDocument,
  target: FormTarget,
  body: unknown,
): Record<string, unknown> {
  const answers = isRecord(body) && isRecord(body.data) ? body.data : {};
  const params = isRecord(body) && isRecord(body.params) ? body.params : {};
  const data: Record<string, unknown> = {};

  for (const step of form.steps ?? []) {
    for (const { field: name } of step.questions ?? []) {
      const entry = target.fields.get(name);
      if (!entry || !('field' in entry) || !Object.hasOwn(answers, name)) continue;

      const value = cleanAnswer(entry.field, answers[name]);
      if (value !== undefined) data[name] = value;
    }
  }

  for (const { name, field } of form.hiddenParams ?? []) {
    const value = Object.hasOwn(params, name) ? params[name] : undefined;

    if (typeof value === 'string' && value) data[field] = value.slice(0, PARAM_MAX_LENGTH);
  }

  return data;
}

function fieldErrors(error: unknown): FormFieldError[] | undefined {
  if (!(error instanceof APIError) || error.name !== 'ValidationError') return;

  const details = (error.data as { errors?: { path?: unknown; message?: unknown }[] } | undefined)
    ?.errors;

  return (details ?? []).map(({ path, message }) => ({
    ...(typeof path === 'string' ? { field: path } : {}),
    message: typeof message === 'string' ? message : 'This value is invalid.',
  }));
}

export function createDefinitionEndpoint(runtime: FormsRuntime): Endpoint {
  return {
    method: 'get',
    path: '/:slug/definition',
    handler: async (req) => {
      const found = await findForm(req, runtime, req.routeParams?.slug);
      if (!found) return notFound();

      return Response.json(await definitionFor(req, runtime, found));
    },
  };
}

export function createSubmitEndpoint(runtime: FormsRuntime): Endpoint {
  const { spam } = runtime;

  return {
    method: 'post',
    path: '/:slug/submit',
    handler: async (req) => {
      const ip = clientIp(req.headers, spam.trustProxy);

      try {
        const limit = ip ? await takeRateLimit(req.frogbot, ip, spam.rateLimit) : undefined;

        if (limit && !limit.allowed) {
          return failure(429, 'Too many submissions. Try again later.', {
            'Retry-After': String(limit.retryAfter),
          });
        }
      } catch (error) {
        if (error instanceof KVLockContentionError) return busy();

        throw error;
      }

      const found = await findForm(req, runtime, req.routeParams?.slug);
      if (!found) return notFound();

      const { form, target } = found;

      if (await formIsClosed(req.frogbot, form)) return closed();

      try {
        await addDataAndFileToRequest(req);
      } catch {
        return failure(400, 'The request body is invalid.');
      }

      const body = isRecord(req.data) ? req.data : {};

      if (typeof body.honeypot === 'string' && body.honeypot) return confirmed(form);

      if (spam.turnstile) {
        const verified = await verifyTurnstile({
          secretKey: spam.turnstile.secretKey,
          token: body.turnstile,
          ip,
        }).catch((error: unknown) => {
          req.frogbot.logger.warn({ err: error }, '[plugin-forms] Turnstile check failed');

          return false;
        });

        if (!verified) return failure(400, "We couldn't verify you're human. Try again.");
      }

      const data = pickSubmission(form, target, body);

      try {
        const outcome = await countResponse(req.frogbot, form, async () => {
          req.context.form = createFormSubmission(form, target.slug);

          try {
            await req.frogbot.create({
              collection: target.slug,
              data,
              depth: 0,
              overrideAccess: false,
              req,
            });
          } finally {
            delete req.context.form;
          }
        });

        if (outcome.closed) return closed();

        return confirmed(form);
      } catch (error) {
        const errors = fieldErrors(error);
        if (errors) return Response.json({ errors } satisfies FormSubmitResponse, { status: 400 });

        if (error instanceof APIError && error.status < 500) {
          return failure(error.status, error.message);
        }

        if (error instanceof KVLockContentionError) return busy();

        req.frogbot.logger.error({ err: error, form: form.slug }, '[plugin-forms] Submit failed');

        return failure(500, 'Something went wrong.');
      }
    },
  };
}
