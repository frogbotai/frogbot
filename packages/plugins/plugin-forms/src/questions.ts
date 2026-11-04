import {
  type Field,
  fieldAffectsData,
  fieldIsVirtual,
  type FrogBotRequest,
  tabHasName,
} from 'frogbot';

import { createFormSubmission } from './access.js';
import type { FormDocument, FormQuestionType } from './types.js';
import {
  checkUploadQuestion,
  checkUploadTotals,
  DEFAULT_UPLOAD_LIMITS,
  type UploadLimits,
  type UploadRules,
  uploadRules,
} from './uploads.js';

export const QUESTION_TYPES = [
  'checkbox',
  'date',
  'email',
  'number',
  'radio',
  'select',
  'text',
  'textarea',
  'upload',
] as const satisfies readonly FormQuestionType[];

const PARAM_TYPES = new Set<FormQuestionType>(['email', 'text', 'textarea']);

export type QuestionField = Extract<Field, { type: FormQuestionType }>;

/** A top-level data field of a target collection: usable as a question, or refused with a reason. */
export type FieldEntry =
  | { name: string; field: QuestionField; required: boolean }
  | { name: string; reason: string; required: boolean };

export type FieldCatalog = Map<string, FieldEntry>;

export type FormTarget = {
  slug: string;
  fields: FieldCatalog;
  /** True for an upload collection, which file questions can store files in. */
  upload?: boolean;
};

export type FormError = { path: string; message: string };

function isQuestionType(type: string): type is FormQuestionType {
  return (QUESTION_TYPES as readonly string[]).includes(type);
}

function isRequired(field: Field): boolean {
  return 'required' in field && field.required === true && field.defaultValue === undefined;
}

function refusal(field: Field): string | undefined {
  if (fieldIsVirtual(field)) return 'is virtual';
  if ('hidden' in field && field.hidden) return 'is hidden';
  if (!isQuestionType(field.type)) return `has type ${field.type}, which forms can't ask for`;
  if ((field.type === 'text' || field.type === 'number') && field.hasMany) {
    return "holds a list, which forms can't ask for";
  }

  if (field.type === 'upload' && typeof field.relationTo !== 'string') {
    return "takes files from several collections, which forms can't ask for";
  }
}

/** Walks a collection's top-level data fields, through unnamed rows, collapsibles, groups and tabs. */
export function collectFields(fields: Field[], catalog: FieldCatalog = new Map()): FieldCatalog {
  for (const field of fields) {
    if (field.type === 'tabs') {
      for (const tab of field.tabs) {
        if (tabHasName(tab)) {
          catalog.set(tab.name, {
            name: tab.name,
            reason: "is a named tab, which forms can't ask for",
            required: false,
          });
        } else {
          collectFields(tab.fields, catalog);
        }
      }

      continue;
    }

    if (!fieldAffectsData(field)) {
      if ('fields' in field) collectFields(field.fields, catalog);

      continue;
    }

    if (field.name === 'id') continue;

    const reason = refusal(field);
    const required = isRequired(field);

    catalog.set(
      field.name,
      reason === undefined
        ? { name: field.name, field: field as QuestionField, required }
        : { name: field.name, reason, required },
    );
  }

  return catalog;
}

function formRequest(req: FrogBotRequest, form: Partial<FormDocument>, collection: string) {
  const context = { ...req.context, form: createFormSubmission(form as FormDocument, collection) };

  return new Proxy(req, {
    get: (target, property) => {
      if (property === 'user') return null;
      if (property === 'context') return context;

      return Reflect.get(target, property) as unknown;
    },
  });
}

async function canCreate(field: QuestionField, req: FrogBotRequest): Promise<boolean> {
  const create = field.access?.create;
  if (!create) return true;

  return Boolean(await create({ req, data: {}, siblingData: {} }));
}

function isSafeRedirect(url: string): boolean {
  if (url.startsWith('/')) return !url.startsWith('//') && !url.startsWith('/\\');

  return /^https?:\/\/[^\s]+$/i.test(url);
}

/**
 * The reasons a form can't be saved, each with the path of the form field at fault. A closed
 * form skips the question checks, so it can always be closed, or drafted before it opens.
 */
export async function checkForm({
  form,
  targets,
  req,
  limits = DEFAULT_UPLOAD_LIMITS,
}: {
  form: Partial<FormDocument>;
  targets: Map<string, FormTarget>;
  req: FrogBotRequest;
  /** The app's upload limits, which file questions must fit in. */
  limits?: UploadLimits;
}): Promise<FormError[]> {
  const errors: FormError[] = [];

  if (form.slug !== undefined && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug)) {
    errors.push({
      path: 'slug',
      message: 'Use lowercase letters, numbers and single hyphens, like "contact-us".',
    });
  }

  if (form.confirmation?.type === 'redirect') {
    const url = form.confirmation.redirect ?? '';

    if (!isSafeRedirect(url)) {
      errors.push({
        path: 'confirmation.redirect',
        message: 'Use a path starting with "/" or an http(s) URL.',
      });
    }
  }

  const target = form.collection ? targets.get(form.collection) : undefined;

  if (!target) {
    errors.push({
      path: 'collection',
      message: `"${form.collection ?? ''}" isn't a collection forms can create records in.`,
    });

    return errors;
  }

  if (form.status === 'closed') return errors;

  const visitor = formRequest(req, form, target.slug);
  const used = new Set<string>();

  const usable = async (
    path: string,
    name: string,
    types?: Set<FormQuestionType>,
  ): Promise<QuestionField | undefined> => {
    const entry = target.fields.get(name);

    if (!entry) {
      errors.push({ path, message: `"${name}" isn't a top-level field of ${target.slug}.` });

      return;
    }

    if (used.has(name)) {
      errors.push({ path, message: `"${name}" is already on this form.` });

      return;
    }

    used.add(name);

    if ('reason' in entry) {
      errors.push({ path, message: `"${name}" ${entry.reason}.` });

      return;
    }

    if (types && !types.has(entry.field.type)) {
      errors.push({ path, message: `"${name}" must be a text, textarea or email field.` });

      return;
    }

    if (!(await canCreate(entry.field, visitor))) {
      errors.push({
        path,
        message: `"${name}" can't be filled from a form: its create access denies form submissions.`,
      });

      return;
    }

    return entry.field;
  };

  const files: { name: string; rules: UploadRules }[] = [];

  for (const [stepIndex, step] of (form.steps ?? []).entries()) {
    for (const [index, question] of (step.questions ?? []).entries()) {
      const path = `steps.${stepIndex}.questions.${index}`;
      const field = await usable(`${path}.field`, question.field);

      if (field?.type !== 'upload') continue;

      const refused = checkUploadQuestion({ path, question, field, targets, limits });

      errors.push(...refused);
      if (!refused.length) files.push({ name: field.name, rules: uploadRules(question, limits) });
    }
  }

  errors.push(...checkUploadTotals(files, limits));

  const asked = new Set(used);
  const params = new Set<string>();

  for (const [index, param] of (form.hiddenParams ?? []).entries()) {
    if (params.has(param.name)) {
      errors.push({
        path: `hiddenParams.${index}.name`,
        message: `"${param.name}" is already a parameter.`,
      });
    }

    params.add(param.name);
    await usable(`hiddenParams.${index}.field`, param.field, PARAM_TYPES);
  }

  for (const entry of target.fields.values()) {
    if (entry.required && !asked.has(entry.name)) {
      errors.push({
        path: 'steps',
        message: `"${entry.name}" is required by ${target.slug} and has no default, so the form must ask for it.`,
      });
    }
  }

  return errors;
}
