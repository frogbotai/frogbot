import {
  addDataAndFileToRequest,
  APIError,
  type Endpoint,
  type FrogBotRequest,
  KVLockContentionError,
} from 'frogbot';

import { createFormSubmission } from './access.js';
import { countResponse, formIsClosed } from './closing.js';
import { buildConfirmation, buildDefinition } from './definition.js';
import type { FormTarget, QuestionField } from './questions.js';
import type { FormDocument, FormFieldError, FormSubmitResponse } from './types.js';

export const PARAM_MAX_LENGTH = 500;

const notFound = () =>
  Response.json({ error: 'Not found' } satisfies FormSubmitResponse, { status: 404 });

const closed = () =>
  Response.json({ error: 'This form is closed.' } satisfies FormSubmitResponse, { status: 410 });

async function loadForm(req: FrogBotRequest): Promise<FormDocument | undefined> {
  const slug = req.routeParams?.slug;
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

  return result.docs[0] as FormDocument | undefined;
}

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

export function createDefinitionEndpoint(targets: Map<string, FormTarget>): Endpoint {
  return {
    method: 'get',
    path: '/:slug/definition',
    handler: async (req) => {
      const form = await loadForm(req);
      const target = form && targets.get(form.collection);
      if (!form || !target) return notFound();

      const definition = buildDefinition({
        form,
        fields: target.fields,
        closed: await formIsClosed(req.frogbot, form),
        language: req.i18n?.language,
      });

      return Response.json(definition);
    },
  };
}

export function createSubmitEndpoint(targets: Map<string, FormTarget>): Endpoint {
  return {
    method: 'post',
    path: '/:slug/submit',
    handler: async (req) => {
      const form = await loadForm(req);
      const target = form && targets.get(form.collection);
      if (!form || !target) return notFound();

      if (await formIsClosed(req.frogbot, form)) return closed();

      try {
        await addDataAndFileToRequest(req);
      } catch {
        return Response.json(
          { error: 'The request body is invalid.' } satisfies FormSubmitResponse,
          {
            status: 400,
          },
        );
      }

      const data = pickSubmission(form, target, req.data);

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

        return Response.json({
          confirmation: buildConfirmation(form),
        } satisfies FormSubmitResponse);
      } catch (error) {
        const errors = fieldErrors(error);
        if (errors) return Response.json({ errors } satisfies FormSubmitResponse, { status: 400 });

        if (error instanceof APIError && error.status < 500) {
          return Response.json({ error: error.message } satisfies FormSubmitResponse, {
            status: error.status,
          });
        }

        if (error instanceof KVLockContentionError) {
          return Response.json(
            { error: 'This form is busy. Try again.' } satisfies FormSubmitResponse,
            {
              status: 503,
            },
          );
        }

        req.frogbot.logger.error({ err: error, form: form.slug }, '[plugin-forms] Submit failed');

        return Response.json({ error: 'Something went wrong.' } satisfies FormSubmitResponse, {
          status: 500,
        });
      }
    },
  };
}
