import {
  type Field,
  fieldAffectsData,
  fieldIsVirtual,
  type FrogBotRequest,
  type Option,
  optionIsObject,
  tabHasName,
} from 'frogbot';

import { createFormLinkContext, createFormSubmission } from './access.js';
import {
  DEFAULT_UPLOAD_LIMITS,
  fieldRefusal,
  type FormFieldInfo,
  missingRequired,
  type UploadLimits,
  type UploadRules,
  uploadRules,
  type UsableFieldInfo,
} from './definition.js';
import type { FormDocument, FormOption, FormQuestionType } from './types.js';
import { checkUploadQuestion, checkUploadTotals, uploadStoreRefusal } from './uploads.js';

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

/**
 * A top-level data field of a target collection: usable as a question, or refused with a reason.
 * `required` means required with no default. A refused entry keeps its field, if it has one.
 */
export type FieldEntry =
  | { name: string; field: QuestionField; required: boolean }
  | { name: string; reason: string; required: boolean; source?: Field };

export type FieldCatalog = Map<string, FieldEntry>;

export type FormTarget = {
  slug: string;
  fields: FieldCatalog;
  /** True for an upload collection, which file questions can store files in. */
  upload?: boolean;
  /** True when the collection keeps drafts, which edit links can't save yet. */
  drafts?: boolean;
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
        : { name: field.name, reason, required, source: field },
    );
  }

  return catalog;
}

type Label = string | Record<string, string> | false | ((...args: never[]) => unknown) | undefined;

function staticText(value: unknown, language: string | undefined): string | undefined {
  if (typeof value === 'string') return value || undefined;
  if (!value || typeof value !== 'object') return;

  const text = value as Record<string, string>;

  return (language ? text[language] : undefined) ?? Object.values(text)[0];
}

function humanize(name: string): string {
  return name
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .split(/[\s_-]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function toOption(option: Option, language: string | undefined): FormOption {
  if (!optionIsObject(option)) return { label: option, value: option };

  return {
    label: staticText(option.label, language) ?? option.value,
    value: option.value,
  };
}

function describeUsable(field: QuestionField, language: string | undefined): UsableFieldInfo {
  const admin = (field.admin ?? {}) as { description?: Label; placeholder?: Label };
  const info: UsableFieldInfo = {
    name: field.name,
    label: staticText(field.label, language) || humanize(field.name),
    type: field.type,
    required: field.required === true,
    hasDefault: field.defaultValue !== undefined,
  };

  const description = staticText(admin.description, language);
  const placeholder = staticText(admin.placeholder, language);

  if (description) info.description = description;
  if (placeholder) info.placeholder = placeholder;

  if (field.type === 'select' || field.type === 'radio') {
    info.options = field.options.map((option) => toOption(option, language));
  }

  if ((field.type === 'select' || field.type === 'upload') && field.hasMany) info.hasMany = true;

  if (
    field.type !== 'upload' &&
    field.defaultValue !== undefined &&
    typeof field.defaultValue !== 'function'
  ) {
    info.defaultValue = field.defaultValue;
  }

  return info;
}

/**
 * The target's fields as the renderer sees them, without the access checks: enough to render a
 * form, which leaves out the questions no form can ask for.
 */
export function describeFields(
  target: Pick<FormTarget, 'fields'>,
  language?: string,
): FormFieldInfo[] {
  return [...target.fields.values()].map((entry) => {
    if ('field' in entry) return describeUsable(entry.field, language);

    const source = entry.source as
      { type: string; label?: unknown; required?: boolean; defaultValue?: unknown } | undefined;

    return {
      name: entry.name,
      label: staticText(source?.label, language) || humanize(entry.name),
      type: source?.type ?? 'tab',
      required: source?.required === true,
      hasDefault: source?.defaultValue !== undefined,
      refusal: entry.reason,
    };
  });
}

function formRequest(req: FrogBotRequest, form: Partial<FormDocument>, collection: string) {
  const context = {
    ...req.context,
    form: createFormSubmission(form as FormDocument, collection),
    formLink: createFormLinkContext({ id: '', collection, record: '' }),
  };

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

async function canEdit(field: QuestionField, req: FrogBotRequest): Promise<boolean> {
  for (const rule of [field.access?.read, field.access?.update]) {
    if (rule && !(await rule({ req, data: {}, siblingData: {}, doc: {} }))) return false;
  }

  return true;
}

/**
 * The fields a question may use and the ones it may not, with reasons: the one list the save
 * check, the builder and the preview share, so the builder never offers a field saving refuses.
 * Access is probed as a signed-out form submission, and through an edit link, as visitors are.
 */
export async function listQuestionFields({
  target,
  targets,
  req,
  form = {},
}: {
  target: FormTarget;
  /** Every target, for the upload collections file questions store files in. */
  targets: Map<string, FormTarget>;
  req: FrogBotRequest;
  /** The form being saved, which access rules see on the flag. */
  form?: Partial<FormDocument>;
}): Promise<FormFieldInfo[]> {
  const visitor = formRequest(req, { ...form, collection: target.slug }, target.slug);
  const fields = describeFields(target, req.i18n?.language);

  return Promise.all(
    fields.map(async (info) => {
      const entry = target.fields.get(info.name);
      if ('refusal' in info || !entry || !('field' in entry)) return info;

      const { field } = entry;
      const store = field.type === 'upload' ? uploadStoreRefusal(field, targets) : undefined;

      if (!(await canCreate(field, visitor))) {
        info.createRefusal =
          "can't be filled from a form: its create access denies form submissions";
      } else if (store) {
        info.createRefusal = store;
      }

      if (!(await canEdit(field, visitor))) {
        info.editRefusal =
          "can't be changed through an edit link: its read or update access denies form links";
      } else if (field.type === 'upload') {
        info.editRefusal = "is a file question, which edit links can't change yet";
      }

      return info;
    }),
  );
}

function isSafeRedirect(url: string): boolean {
  if (url.startsWith('/')) return !url.startsWith('//') && !url.startsWith('/\\');

  return /^https?:\/\/[^\s]+$/i.test(url);
}

/**
 * The reasons a form can't be saved, each with the path of the form field at fault. A closed
 * form skips the question checks, so it can always be closed, or drafted before it opens.
 * Creating forms must be able to create a record; editing forms (`update`, `both`) must be able
 * to read and update each question's field through a link.
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

  const mode = form.mode ?? 'create';
  const creates = mode !== 'update';

  if (mode !== 'create' && target.drafts) {
    errors.push({
      path: 'mode',
      message: `${target.slug} keeps drafts, which edit links can't save yet. Use the create mode.`,
    });
  }

  const list = await listQuestionFields({ target, targets, req, form });
  const fields = new Map(list.map((info) => [info.name, info]));
  const used = new Set<string>();

  const usable = (path: string, name: string, types?: Set<FormQuestionType>): boolean => {
    const info = fields.get(name);

    if (!info) {
      errors.push({ path, message: `"${name}" isn't a top-level field of ${target.slug}.` });

      return false;
    }

    if (used.has(name)) {
      errors.push({ path, message: `"${name}" is already on this form.` });

      return false;
    }

    used.add(name);

    if (types && !('refusal' in info) && !types.has(info.type)) {
      errors.push({ path, message: `"${name}" must be a text, textarea or email field.` });

      return false;
    }

    const reason = fieldRefusal(info, types ? 'create' : mode);

    if (reason) {
      errors.push({ path, message: `"${name}" ${reason}.` });

      return false;
    }

    return true;
  };

  const files: { name: string; rules: UploadRules }[] = [];

  for (const [stepIndex, step] of (form.steps ?? []).entries()) {
    for (const [index, question] of (step.questions ?? []).entries()) {
      const path = `steps.${stepIndex}.questions.${index}`;
      const entry = target.fields.get(question.field);

      if (!usable(`${path}.field`, question.field) || !entry || !('field' in entry)) continue;
      if (entry.field.type !== 'upload') continue;

      const { field } = entry;
      const refused = checkUploadQuestion({ path, question, field, limits });

      errors.push(...refused);
      if (!refused.length) files.push({ name: field.name, rules: uploadRules(question, limits) });
    }
  }

  errors.push(...checkUploadTotals(files, limits));

  const asked = new Set(used);
  const params = new Set<string>();

  for (const [index, param] of (creates ? (form.hiddenParams ?? []) : []).entries()) {
    if (params.has(param.name)) {
      errors.push({
        path: `hiddenParams.${index}.name`,
        message: `"${param.name}" is already a parameter.`,
      });
    }

    params.add(param.name);
    usable(`hiddenParams.${index}.field`, param.field, PARAM_TYPES);
  }

  for (const { name } of missingRequired(list, asked, mode)) {
    errors.push({
      path: 'steps',
      message: `"${name}" is required by ${target.slug} and has no default, so the form must ask for it.`,
    });
  }

  return errors;
}
