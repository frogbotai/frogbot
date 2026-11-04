import type { FrogBotConfig, FrogBotRequest, UploadField } from 'frogbot';

import { createFormSubmission } from './access.js';
import {
  DEFAULT_UPLOAD_LIMITS,
  type UploadLimits,
  type UploadRules,
  uploadRules,
} from './definition.js';
import type { FormError, FormTarget } from './questions.js';
import type { FormDocument, FormFieldError, FormQuestionConfig } from './types.js';

const MiB = 1024 * 1024;

/** Most files one question may take. */
export const MAX_FILES = 5;

/** Room left in a request for the answers and multipart framing, beside the files. */
export const ANSWERS_ALLOWANCE = MiB;

const MIME_PATTERN = /^[\w!#$&^.+-]+\/(?:\*|[\w!#$&^.+-]+)$/;

/** A file from `req.files`, as Payload's multipart parser leaves it. */
export type RequestFile = {
  data: Buffer;
  mimetype: string;
  name: string;
  size: number;
  tempFilePath?: string;
};

export type UploadQuestion = {
  key: string;
  collection: string;
  hasMany: boolean;
  required: boolean;
  rules: UploadRules;
};

export type CreatedFile = { collection: string; id: number | string };

/** A file the upload collection refused, such as a scanning hook that threw. */
export class FileRejected extends Error {
  constructor(
    readonly field: string,
    readonly reason: unknown,
  ) {
    super(`[plugin-forms] A file for "${field}" was refused.`);
  }
}

/** Merges the limits as Payload does for every multipart request: `upload` over `bodyParser`. */
export function resolveUploadLimits(
  config: Pick<FrogBotConfig, 'bodyParser' | 'upload'>,
): UploadLimits {
  const options = { ...config.bodyParser, ...config.upload };

  return {
    fileSize: options.limits?.fileSize ?? DEFAULT_UPLOAD_LIMITS.fileSize,
    files: options.limits?.files ?? DEFAULT_UPLOAD_LIMITS.files,
    requestSize: options.requestSizeLimit ?? DEFAULT_UPLOAD_LIMITS.requestSize,
  };
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return 'any size';
  if (bytes < MiB) return `${Math.max(1, Math.round(bytes / 1024))} KB`;

  return `${Number((bytes / MiB).toFixed(1))} MB`;
}

/** True when the type matches a pattern like `application/pdf` or `image/*`; any type when there are none. */
export function matchesMimeType(type: string, patterns: string[]): boolean {
  if (patterns.length === 0) return true;

  const actual = type.toLowerCase();

  return patterns.some((pattern) => {
    const expected = pattern.toLowerCase();

    return expected.endsWith('/*') ? actual.startsWith(expected.slice(0, -1)) : actual === expected;
  });
}

/** Why no form can store files through `field`, after its name, or `undefined` when one can. */
export function uploadStoreRefusal(
  field: UploadField,
  targets: Map<string, FormTarget>,
): string | undefined {
  const store = typeof field.relationTo === 'string' ? targets.get(field.relationTo) : undefined;

  if (!store?.upload) {
    return `stores files in ${String(field.relationTo)}, which isn't an upload collection listed in formsPlugin({ collections })`;
  }

  for (const entry of store.fields.values()) {
    if (entry.required) {
      return `stores files in ${store.slug}, which requires "${entry.name}" with no default, so a form can't save a file there`;
    }
  }
}

/** The save checks for one file question's settings against the app's limits. */
export function checkUploadQuestion({
  path,
  question,
  field,
  limits,
}: {
  path: string;
  question: FormQuestionConfig;
  field: UploadField;
  limits: UploadLimits;
}): FormError[] {
  const errors: FormError[] = [];
  const { name } = field;
  const { maxFiles, maxFileSize, mimeTypes } = question;

  if (maxFiles !== undefined && maxFiles !== null) {
    if (!Number.isInteger(maxFiles) || maxFiles < 1 || maxFiles > MAX_FILES) {
      errors.push({
        path: `${path}.maxFiles`,
        message: `"${name}": maxFiles must be a whole number from 1 to ${MAX_FILES}.`,
      });
    } else if (maxFiles > 1 && !field.hasMany) {
      errors.push({
        path: `${path}.maxFiles`,
        message: `"${name}" holds one file, so maxFiles must be 1. Use a hasMany upload field for several.`,
      });
    }
  }

  if (maxFileSize !== undefined && maxFileSize !== null) {
    if (!Number.isInteger(maxFileSize) || maxFileSize < 1) {
      errors.push({
        path: `${path}.maxFileSize`,
        message: `"${name}": maxFileSize must be a whole number of bytes above 0.`,
      });
    } else if (maxFileSize > limits.fileSize) {
      errors.push({
        path: `${path}.maxFileSize`,
        message: `"${name}" accepts files up to ${formatBytes(maxFileSize)}, over the app's ${formatBytes(limits.fileSize)} per-file upload limit. Raise upload.limits.fileSize in the config, or lower maxFileSize.`,
      });
    }
  }

  for (const type of mimeTypes ?? []) {
    if (MIME_PATTERN.test(type)) continue;

    errors.push({
      path: `${path}.mimeTypes`,
      message: `"${name}": "${type}" isn't a file type like application/pdf or image/*.`,
    });
  }

  return errors;
}

/** Refuses a form whose file questions together could pass the app's per-request limits. */
export function checkUploadTotals(
  questions: { name: string; rules: UploadRules }[],
  limits: UploadLimits,
): FormError[] {
  if (questions.length === 0) return [];

  const names = questions.map(({ name }) => `"${name}"`).join(', ');
  const files = questions.reduce((total, { rules }) => total + rules.maxFiles, 0);
  const bytes = questions.reduce(
    (total, { rules }) => total + rules.maxFiles * rules.maxFileSize,
    0,
  );

  const errors: FormError[] = [];

  if (files > limits.files) {
    errors.push({
      path: 'steps',
      message: `${names} take up to ${files} files together, over the app's limit of ${limits.files} per request. Raise upload.limits.files in the config, or lower maxFiles.`,
    });
  }

  if (bytes + ANSWERS_ALLOWANCE > limits.requestSize) {
    errors.push({
      path: 'steps',
      message: `${names} take up to ${formatBytes(bytes)} of files together, over the app's ${formatBytes(limits.requestSize)} request limit less ${formatBytes(ANSWERS_ALLOWANCE)} for the answers. Raise upload.requestSizeLimit in the config, or lower maxFileSize or maxFiles.`,
    });
  }

  return errors;
}

/** The form's file questions whose fields are still usable. */
export function uploadQuestions(
  form: FormDocument,
  target: FormTarget,
  limits: UploadLimits,
): UploadQuestion[] {
  return (form.steps ?? []).flatMap((step) =>
    (step.questions ?? []).flatMap((question) => {
      const entry = target.fields.get(question.field);

      if (!entry || !('field' in entry) || entry.field.type !== 'upload') return [];

      const { field } = entry;
      if (typeof field.relationTo !== 'string') return [];

      return [
        {
          key: field.name,
          collection: field.relationTo,
          hasMany: field.hasMany === true,
          required: entry.required,
          rules: uploadRules(question, limits),
        },
      ];
    }),
  );
}

function filesFor(files: FrogBotRequest['files'], key: string): RequestFile[] {
  const value = files && Object.hasOwn(files, key) ? files[key] : undefined;

  if (!value) return [];

  return Array.isArray(value) ? value : [value];
}

function isEmptyAnswer(value: unknown): boolean {
  return (
    value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)
  );
}

/**
 * Checks the attached files against each question before anything is saved. A value in `data`
 * for a file question, such as an existing file's ID, is refused: visitors send files only.
 */
export function checkFiles(
  questions: UploadQuestion[],
  answers: Record<string, unknown>,
  files: FrogBotRequest['files'],
): FormFieldError[] {
  const errors: FormFieldError[] = [];

  for (const { key, required, rules } of questions) {
    if (Object.hasOwn(answers, key) && !isEmptyAnswer(answers[key])) {
      errors.push({ field: key, message: "Attach the file itself. File IDs aren't accepted." });

      continue;
    }

    const attached = filesFor(files, key);

    if (attached.length === 0) {
      if (required) errors.push({ field: key, message: 'This field is required.' });

      continue;
    }

    if (attached.length > rules.maxFiles) {
      errors.push({
        field: key,
        message:
          rules.maxFiles === 1 ? 'Attach one file.' : `Attach up to ${rules.maxFiles} files.`,
      });

      continue;
    }

    for (const file of attached) {
      if (file.size > rules.maxFileSize) {
        errors.push({
          field: key,
          message: `"${file.name}" is larger than ${formatBytes(rules.maxFileSize)}.`,
        });
      } else if (!matchesMimeType(file.mimetype, rules.mimeTypes)) {
        errors.push({
          field: key,
          message: `"${file.name}" isn't an accepted type (${rules.mimeTypes.join(', ')}).`,
        });
      }
    }
  }

  return errors;
}

/** Runs `fn` flagged as this form's submission into `collection`, as the record itself is. */
export async function asSubmission<T>(
  req: FrogBotRequest,
  form: FormDocument,
  collection: string,
  fn: () => Promise<T>,
): Promise<T> {
  req.context.form = createFormSubmission(form, collection);

  try {
    return await fn();
  } finally {
    delete req.context.form;
  }
}

/**
 * Creates each attached file in its upload collection like the record, flagged and with
 * `overrideAccess: false`, so the collection's hooks, a scanner among them, run first. Returns
 * the record's values by question key; every file made is pushed to `created`.
 */
export async function createUploads({
  req,
  form,
  questions,
  created,
}: {
  req: FrogBotRequest;
  form: FormDocument;
  questions: UploadQuestion[];
  created: CreatedFile[];
}): Promise<Record<string, unknown>> {
  const data: Record<string, unknown> = {};

  for (const { key, collection, hasMany } of questions) {
    const ids: (number | string)[] = [];

    for (const file of filesFor(req.files, key)) {
      try {
        const doc = await asSubmission(req, form, collection, () =>
          req.frogbot.create({
            collection,
            data: {},
            file: {
              data: file.data,
              mimetype: file.mimetype,
              name: file.name,
              size: file.size,
              ...(file.tempFilePath ? { tempFilePath: file.tempFilePath } : {}),
            },
            depth: 0,
            overrideAccess: false,
            req,
          }),
        );

        created.push({ collection, id: doc.id });
        ids.push(doc.id);
      } catch (error) {
        throw new FileRejected(key, error);
      }
    }

    if (ids.length) data[key] = hasMany ? ids : ids[0];
  }

  return data;
}

/** Deletes the files this submission made, and only those. */
export async function deleteUploads(req: FrogBotRequest, created: CreatedFile[]): Promise<void> {
  for (const { collection, id } of created) {
    try {
      await req.frogbot.delete({ collection, id, depth: 0, overrideAccess: true, req });
    } catch (error) {
      req.frogbot.logger.error(
        { err: error, collection, id },
        '[plugin-forms] Could not delete a file after a failed submission',
      );
    }
  }
}

/** One boot warning for each listed upload collection with no `beforeChange` hook to scan files. */
export function uploadWarnings(
  collections: { slug: string; upload?: unknown; hooks?: { beforeChange?: unknown[] } }[],
): string[] {
  return collections.flatMap(({ slug, upload, hooks }) =>
    upload && !hooks?.beforeChange?.length
      ? [
          `[plugin-forms] '${slug}' takes files from public forms but has no beforeChange hook, so they're stored unscanned. Add a hook that scans each file: https://docs.frogbot.ai/plugins/forms#scanning-files`,
        ]
      : [],
  );
}
