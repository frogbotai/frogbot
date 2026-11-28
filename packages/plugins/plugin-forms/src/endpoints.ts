import {
  addDataAndFileToRequest,
  APIError,
  type Endpoint,
  frogbotError,
  type FrogBotRequest,
  isFrogBotError,
  problemResponse,
} from 'frogbot';

import { bodyAnswers, pickSubmission, shownQuestions } from './answers.js';
import { countResponse, formIsClosed, isClosed } from './closing.js';
import { buildConfirmation } from './definition.js';
import { formError } from './errors.js';
import {
  asFormLink,
  openLinkLimited,
  prefill,
  type ResolvedLink,
  resolveLink,
  spendUse,
} from './links/resolve.js';
import { definitionFor, findForm, type FormsRuntime } from './lookup.js';
import type { FormTarget } from './questions.js';
import { clientIp, takeRateLimit, verifyTurnstile } from './spam.js';
import { countEvent } from './stats.js';
import type {
  FormDocument,
  FormFieldError,
  FormIgnoredAnswer,
  FormSubmitResponse,
} from './types.js';
import {
  asSubmission,
  checkFiles,
  type CreatedFile,
  createUploads,
  deleteUploads,
  FileRejected,
  uploadQuestions,
} from './uploads.js';

const answer = (req: FrogBotRequest, error: unknown) => problemResponse(error, { req });

const notFound = (req: FrogBotRequest) => answer(req, formError('forms.not-found'));

const closed = (req: FrogBotRequest) => answer(req, formError('forms.closed'));

const linkGone = (req: FrogBotRequest) => answer(req, formError('forms.link-invalid'));

const busy = (req: FrogBotRequest) => answer(req, formError('forms.busy'));

const tooMany = (req: FrogBotRequest, retryAfter: number) =>
  answer(req, formError('forms.rate-limited', { retryAfter }));

const invalid = (req: FrogBotRequest, errors: FormFieldError[]) =>
  answer(
    req,
    formError(
      errors.some(({ code }) => code === 'invalid_answer')
        ? 'forms.invalid-answer'
        : 'forms.invalid',
      {
        fields: errors.map(({ code, field, message }) => ({
          path: field ?? '',
          message,
          ...(code === 'invalid_answer' ? { code: 'forms.invalid-answer' } : {}),
        })),
      },
    ),
  );

const confirmed = (form: FormDocument, ignored: FormIgnoredAnswer[] = []) =>
  Response.json({
    confirmation: buildConfirmation(form),
    ...(ignored.length ? { ignored } : {}),
  } satisfies FormSubmitResponse);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function fileErrors(rejected: FileRejected): FormFieldError[] | undefined {
  const errors = fieldErrors(rejected.reason);
  if (errors) return errors.map(({ message }) => ({ field: rejected.field, message }));

  if (rejected.reason instanceof APIError && rejected.reason.status < 500) {
    return [{ field: rejected.field, message: rejected.reason.message }];
  }
}

export function createDefinitionEndpoint(runtime: FormsRuntime): Endpoint {
  return {
    method: 'get',
    path: '/:slug/definition',
    handler: async (req) => {
      const token = req.searchParams.get('link');

      if (token === null) {
        const found = await findForm(req, runtime, req.routeParams?.slug);
        if (!found || found.form.mode === 'update') return notFound(req);

        return Response.json(await definitionFor(req, runtime, found));
      }

      try {
        const opening = await openLinkLimited(req, runtime, req.routeParams?.slug, token);

        if (opening.status === 'limited') return tooMany(req, opening.retryAfter);
        if (opening.status === 'gone') return linkGone(req);

        return Response.json(opening.definition);
      } catch (error) {
        if (isFrogBotError(error, 'kv.lock-held')) return busy(req);

        throw error;
      }
    },
  };
}

function saveFailed(req: FrogBotRequest, form: FormDocument, error: unknown): Response {
  const errors = fieldErrors(error);
  if (errors) return invalid(req, errors);

  if (error instanceof APIError && error.status < 500) return answer(req, error);

  if (isFrogBotError(error, 'kv.lock-held')) return busy(req);

  req.frogbot.logger.error({ err: error, form: form.slug }, '[plugin-forms] Submit failed');

  return answer(req, frogbotError('internal', { cause: error }));
}

async function saveEdit(
  req: FrogBotRequest,
  form: FormDocument,
  target: FormTarget,
  link: ResolvedLink,
  body: Record<string, unknown>,
): Promise<Response> {
  const ruled = (form.steps ?? []).flatMap(({ questions }) =>
    (questions ?? []).flatMap(({ rules }) => (rules ?? []).map(({ question }) => question)),
  );

  try {
    const stored = ruled.length ? await prefill(req, form, link, [...new Set(ruled)]) : {};
    const picked = pickSubmission(form, target, body, { edit: true, stored });
    if ('errors' in picked) return invalid(req, picked.errors);

    const outcome = await spendUse(req, form, link, () =>
      asFormLink(req, form, link, () =>
        req.frogbot.update({
          collection: target.slug,
          id: link.context.record,
          data: picked.data,
          depth: 0,
          overrideAccess: false,
          req,
        }),
      ),
    );

    return outcome ? confirmed(form, picked.ignored) : linkGone(req);
  } catch (error) {
    if (error instanceof APIError && (error.status === 403 || error.status === 404)) {
      return linkGone(req);
    }

    return saveFailed(req, form, error);
  }
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

        if (limit && !limit.allowed) return tooMany(req, limit.retryAfter);
      } catch (error) {
        if (isFrogBotError(error, 'kv.lock-held')) return busy(req);

        throw error;
      }

      const found = await findForm(req, runtime, req.routeParams?.slug);
      const token = req.searchParams.get('link');

      if (!found) return token === null ? notFound(req) : linkGone(req);

      const { form, target } = found;
      const link = token === null ? null : await resolveLink(req, form, token);

      if (token !== null && !link) return linkGone(req);
      if (token === null && form.mode === 'update') return notFound(req);

      if (link ? isClosed(form, 0) : await formIsClosed(req.frogbot, form)) return closed(req);

      try {
        await addDataAndFileToRequest(req);
      } catch (error) {
        if (error instanceof APIError && error.status === 413) {
          return answer(req, formError('forms.files-too-large'));
        }

        return answer(req, frogbotError('request.invalid', 'The request body is invalid.'));
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

        if (!verified) return answer(req, formError('forms.not-human'));
      }

      if (link) return saveEdit(req, form, target, link, body);

      const shown = shownQuestions(form, target, body);
      const files = uploadQuestions(form, target, runtime.uploads).filter(({ key }) =>
        shown.has(key),
      );

      const picked = pickSubmission(form, target, body);
      const refused = checkFiles(files, bodyAnswers(body), req.files);

      if ('errors' in picked || refused.length) {
        return invalid(req, [...('errors' in picked ? picked.errors : []), ...refused]);
      }

      try {
        const outcome = await countResponse(req.frogbot, form, async () => {
          const created: CreatedFile[] = [];

          try {
            const uploaded = await createUploads({ req, form, questions: files, created });

            await asSubmission(req, form, target.slug, () =>
              req.frogbot.create({
                collection: target.slug,
                data: { ...picked.data, ...uploaded },
                depth: 0,
                overrideAccess: false,
                req,
              }),
            );
          } catch (error) {
            await deleteUploads(req, created);

            throw error;
          }
        });

        if (outcome.closed) return closed(req);

        if (runtime.analytics) {
          await countEvent(req.frogbot, form, 'completion').catch((error: unknown) => {
            req.frogbot.logger.error(
              { err: error, form: form.slug },
              '[plugin-forms] Counting a completion failed',
            );
          });
        }

        return confirmed(form, picked.ignored);
      } catch (error) {
        if (error instanceof FileRejected) {
          const errors = fileErrors(error);
          if (errors) return invalid(req, errors);

          req.frogbot.logger.error(
            { err: error.reason, form: form.slug, field: error.field },
            '[plugin-forms] Saving a file failed',
          );

          return answer(req, frogbotError('internal', { cause: error.reason }));
        }

        return saveFailed(req, form, error);
      }
    },
  };
}
