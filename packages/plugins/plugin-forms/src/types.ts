import type { CollectionAccess, CollectionSlug } from 'frogbot';

export type FormsPluginOptions<S extends CollectionSlug = CollectionSlug> = {
  /** Collections that forms may create records in. Others are left untouched. */
  collections: S[];
  /** Access for the `forms` collection, merged over the defaults: anyone reads, signed-in users write. */
  access?: CollectionAccess;
  /** Cloudflare Turnstile keys. When set, every submit needs a token that Cloudflare accepts. */
  turnstile?: FormsTurnstileOptions;
  /**
   * Submits allowed from one visitor address per window, counted across forms. Counted only with
   * `trustProxy`.
   *
   * @default { max: 10, window: 600 }
   */
  rateLimit?: FormsRateLimitOptions;
  /**
   * Read the visitor's address from the `x-forwarded-for` (last entry) or `x-real-ip` header your
   * proxy sets. Off, submits aren't rate-limited and boot warns, since anyone can send those headers.
   *
   * @default false
   */
  trustProxy?: boolean;
};

export type FormsTurnstileOptions = {
  /** The widget's site key, sent to the page. */
  siteKey: string;
  /** The secret key, used only on the server to verify tokens. */
  secretKey: string;
};

export type FormsRateLimitOptions = {
  /**
   * Submits allowed per window.
   *
   * @default 10
   */
  max?: number;
  /**
   * Window length in seconds.
   *
   * @default 600
   */
  window?: number;
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
  /** Name of the hidden input people never see. Send its value as `honeypot`; a bot that fills it gets the confirmation and nothing is saved. */
  honeypot: string;
  /** Set when the app uses Cloudflare Turnstile. Send the widget's token as `turnstile`. */
  turnstile?: { siteKey: string };
};

/** The submit body: answers by question key, URL parameters by name, and the spam checks. */
export type FormSubmitBody = {
  data?: Record<string, unknown>;
  params?: Record<string, unknown>;
  honeypot?: string;
  turnstile?: string;
};

export type FormFieldError = { field?: string; message: string };

export type FormSubmitResponse =
  { confirmation: FormConfirmation } | { errors: FormFieldError[] } | { error: string };

/** `req.context.form` while a submission creates its record. */
export type FormSubmission = {
  readonly form: FormDocument;
  readonly collection: string;
};
