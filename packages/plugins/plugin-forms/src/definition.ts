import type {
  FormConfirmation,
  FormDefinition,
  FormDocument,
  FormMode,
  FormOption,
  FormQuestion,
  FormQuestionConfig,
  FormQuestionType,
} from './types.js';

export const DEFAULT_CONFIRMATION = 'Thanks, your response has been sent.';

const MiB = 1024 * 1024;

/** The app's multipart limits, per file, files per request and bytes per request. */
export type UploadLimits = { fileSize: number; files: number; requestSize: number };

/** Payload's defaults when the app sets none. */
export const DEFAULT_UPLOAD_LIMITS: UploadLimits = {
  fileSize: 20 * MiB,
  files: 3,
  requestSize: 50 * MiB,
};

export type UploadRules = { maxFiles: number; maxFileSize: number; mimeTypes: string[] };

export function uploadRules(question: FormQuestionConfig, limits: UploadLimits): UploadRules {
  return {
    maxFiles: question.maxFiles ?? 1,
    maxFileSize: question.maxFileSize ?? limits.fileSize,
    mimeTypes: question.mimeTypes ?? [],
  };
}

type FieldInfoBase = {
  name: string;
  label: string;
  required: boolean;
  hasDefault: boolean;
};

/** A field a question may use, with what the renderer needs from its config. */
export type UsableFieldInfo = FieldInfoBase & {
  type: FormQuestionType;
  description?: string;
  placeholder?: string;
  options?: FormOption[];
  hasMany?: boolean;
  defaultValue?: unknown;
  /** Why a form that creates records can't ask for it, after its name. */
  createRefusal?: string;
  /** Why a form that edits records through links can't ask for it, after its name. */
  editRefusal?: string;
};

/** A field no form can ask for, with why, after its name. */
export type RefusedFieldInfo = FieldInfoBase & { type: string; refusal: string };

/** A top-level data field of a target collection, as the save check, builder and renderer see it. */
export type FormFieldInfo = RefusedFieldInfo | UsableFieldInfo;

/** Why a form in `mode` can't ask for `field`, after its name, or `undefined` when it can. */
export function fieldRefusal(field: FormFieldInfo, mode: FormMode): string | undefined {
  if ('refusal' in field) return field.refusal;
  if (mode !== 'update' && field.createRefusal) return field.createRefusal;
  if (mode !== 'create' && field.editRefusal) return field.editRefusal;
}

/** Fields a form in `mode` must ask for, since creating a record needs them: required, no default. */
export function missingRequired(
  fields: FormFieldInfo[],
  asked: Set<string>,
  mode: FormMode,
): FormFieldInfo[] {
  if (mode === 'update') return [];

  return fields.filter(
    ({ name, required, hasDefault }) => required && !hasDefault && !asked.has(name),
  );
}

function rows<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function buildQuestion(
  config: FormQuestionConfig,
  field: UsableFieldInfo,
  limits: UploadLimits,
): FormQuestion {
  const question: FormQuestion = {
    key: field.name,
    type: field.type,
    label: config.label || field.label,
    required: field.required,
  };

  const description = config.description || field.description;
  const placeholder = config.placeholder || field.placeholder;

  if (description) question.description = description;
  if (placeholder) question.placeholder = placeholder;
  if (field.options) question.options = field.options;
  if (field.hasMany) question.hasMany = true;

  if (field.type === 'upload') {
    const { maxFiles, maxFileSize, mimeTypes } = uploadRules(config, limits);

    question.maxFiles = maxFiles;
    if (Number.isFinite(maxFileSize)) question.maxFileSize = maxFileSize;
    if (mimeTypes.length) question.mimeTypes = mimeTypes;

    return question;
  }

  if (field.defaultValue !== undefined) question.defaultValue = field.defaultValue;

  return question;
}

export function buildConfirmation(form: Pick<FormDocument, 'confirmation'>): FormConfirmation {
  const { confirmation } = form;

  if (confirmation?.type === 'redirect' && confirmation.redirect) {
    return { type: 'redirect', url: confirmation.redirect };
  }

  return { type: 'message', message: confirmation?.message || DEFAULT_CONFIRMATION };
}

/**
 * The render definition of a form: its steps and questions, never the target's other fields.
 * Questions whose field no form can ask for are left out. Client-safe, like this whole module,
 * since the builder and the preview use it; unsaved admin data, where an empty array is a row
 * count, is read as no rows.
 */
export function buildDefinition({
  form,
  fields,
  closed,
  limits = DEFAULT_UPLOAD_LIMITS,
}: {
  form: FormDocument;
  fields: FormFieldInfo[];
  closed: boolean;
  /** The app's upload limits, which set a file question's default size. */
  limits?: UploadLimits;
}): Omit<FormDefinition, 'honeypot' | 'turnstile'> {
  const usable = new Map(
    fields.flatMap((field) => ('refusal' in field ? [] : [[field.name, field] as const])),
  );

  const steps = rows(form.steps).map((step) => {
    const questions = rows(step.questions).flatMap((config) => {
      const field = usable.get(config.field);

      return field ? [buildQuestion(config, field, limits)] : [];
    });

    return step.title ? { title: step.title, questions } : { questions };
  });

  return {
    slug: form.slug,
    title: form.title,
    steps,
    hiddenParams: rows(form.hiddenParams).map(({ name }) => name),
    confirmation: buildConfirmation(form),
    closed,
  };
}
