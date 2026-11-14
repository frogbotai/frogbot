import type { FormRule, FormRuleMatch } from './rules.js';

export type FormQuestionType =
  'checkbox' | 'date' | 'email' | 'number' | 'radio' | 'select' | 'text' | 'textarea' | 'upload';

export type FormOption = { label: string; value: string };

export type FormQuestion = {
  key: string;
  type: FormQuestionType;
  label: string;
  description?: string;
  placeholder?: string;
  required: boolean;
  options?: FormOption[];
  hasMany?: boolean;
  defaultValue?: unknown;
  /** File questions: how many files may be attached. */
  maxFiles?: number;
  /** File questions: the largest file accepted, in bytes. */
  maxFileSize?: number;
  /** File questions: accepted types, like `image/*`. */
  mimeTypes?: string[];
  /** Show the question only when these pass. Absent, it is always shown. */
  rules?: FormRule[];
  /** Set to `any` when one passing rule is enough. Absent, every rule must pass. */
  match?: FormRuleMatch;
};

export type FormStep = {
  title?: string;
  questions: FormQuestion[];
};

export type FormConfirmation =
  { type: 'message'; message: string } | { type: 'redirect'; url: string };

/** A form's render definition, as `GET /api/forms/<slug>/definition` returns it. */
export type FormDefinition = {
  slug: string;
  title: string;
  steps: FormStep[];
  hiddenParams: string[];
  confirmation: FormConfirmation;
  closed: boolean;
  honeypot: string;
  turnstile?: { siteKey: string };
  /** Through an edit link: the record's current answers, which the form starts from. */
  values?: Record<string, unknown>;
};

export type FormFieldError = { field?: string; message: string };

export type FormSubmitResponse =
  { confirmation: FormConfirmation } | { errors: FormFieldError[] } | { error: string };

export type FormValue = boolean | File[] | string | string[];
