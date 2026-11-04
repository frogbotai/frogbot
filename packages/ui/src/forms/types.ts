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
};

export type FormFieldError = { field?: string; message: string };

export type FormSubmitResponse =
  { confirmation: FormConfirmation } | { errors: FormFieldError[] } | { error: string };

export type FormValue = boolean | File[] | string | string[];
