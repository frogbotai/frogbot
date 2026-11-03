import type { CollectionAccess, CollectionSlug } from 'frogbot';

export type FormsPluginOptions<S extends CollectionSlug = CollectionSlug> = {
  /** Collections that forms may create records in. Others are left untouched. */
  collections: S[];
  /** Access for the `forms` collection, merged over the defaults: anyone reads, signed-in users write. */
  access?: CollectionAccess;
};

export type FormQuestionType =
  'checkbox' | 'date' | 'email' | 'number' | 'radio' | 'select' | 'text' | 'textarea';

export type FormQuestionConfig = {
  id?: string | null;
  field: string;
  label?: string | null;
  description?: string | null;
  placeholder?: string | null;
};

export type FormStepConfig = {
  id?: string | null;
  title?: string | null;
  questions?: FormQuestionConfig[] | null;
};

export type FormHiddenParamConfig = {
  id?: string | null;
  name: string;
  field: string;
};

/** A document in the `forms` collection. */
export type FormDocument = {
  id: number | string;
  title: string;
  slug: string;
  collection: string;
  steps?: FormStepConfig[] | null;
  hiddenParams?: FormHiddenParamConfig[] | null;
  confirmation?: {
    type?: 'message' | 'redirect' | null;
    message?: string | null;
    redirect?: string | null;
  } | null;
  status?: 'closed' | 'open' | null;
  closesAt?: string | null;
  maxResponses?: number | null;
};

export type FormConfirmation =
  { type: 'message'; message: string } | { type: 'redirect'; url: string };

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
};

export type FormStep = {
  title?: string;
  questions: FormQuestion[];
};

/** What a renderer needs to show a form. It never names the target collection or its fields beyond the questions. */
export type FormDefinition = {
  slug: string;
  title: string;
  steps: FormStep[];
  /** URL parameter names the page sends back with the answers. */
  hiddenParams: string[];
  confirmation: FormConfirmation;
  closed: boolean;
};

/** The submit body: answers by question key, and URL parameters by name. */
export type FormSubmitBody = {
  data?: Record<string, unknown>;
  params?: Record<string, unknown>;
};

export type FormFieldError = { field?: string; message: string };

export type FormSubmitResponse =
  { confirmation: FormConfirmation } | { errors: FormFieldError[] } | { error: string };

/** `req.context.form` while a submission creates its record. */
export type FormSubmission = {
  readonly form: FormDocument;
  readonly collection: string;
};
