import type { FormRule, FormRuleMatch, FormRuleOperator } from '@frogbotai/ui/forms/rules';
import type { CollectionAccess, CollectionSlug, FrogBotRequest } from 'frogbot';

export type { FormRule, FormRuleMatch, FormRuleOperator };

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
  /** Edit links: how long they last, and who manages them. */
  links?: FormsLinksOptions;
};

/** A length of time: seconds, or a string like `'30m'`, `'12h'`, `'7d'` or `'2w'`. */
export type FormLinkDuration = number | `${number}${'s' | 'm' | 'h' | 'd' | 'w'}`;

export type FormsLinksOptions = {
  /**
   * How long a link lasts when `createFormLink` sets no `expiresIn`.
   *
   * @default '7d'
   */
  defaultExpiry?: FormLinkDuration;
  /**
   * The longest a link may last.
   *
   * @default '30d'
   */
  maxExpiry?: FormLinkDuration;
  /**
   * Access for the `form-links` collection, merged over the default: people who can update a
   * record read, revoke and delete its links. Links are only made by `createFormLink`.
   */
  access?: Pick<CollectionAccess, 'delete' | 'read' | 'update'>;
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
  'checkbox' | 'date' | 'email' | 'number' | 'radio' | 'select' | 'text' | 'textarea' | 'upload';

export type FormQuestionConfig = {
  id?: string | null;
  field: string;
  label?: string | null;
  description?: string | null;
  placeholder?: string | null;
  /** File questions: the largest file accepted, in bytes. Defaults to the app's per-file upload limit. */
  maxFileSize?: number | null;
  /** File questions: how many files one response may attach, up to 5. Defaults to 1. */
  maxFiles?: number | null;
  /** File questions: accepted types, like `application/pdf` or `image/*`. Empty accepts any. */
  mimeTypes?: string[] | null;
  /** Show the question only when these pass. Only questions whose field isn't required may have rules. */
  rules?: FormRuleConfig[] | null;
  /** `any` shows the question when one rule passes. Defaults to `all`. */
  match?: FormRuleMatch | null;
};

/** A rule row as the `forms` collection stores it. */
export type FormRuleConfig = {
  id?: string | null;
  /** The field of an earlier, non-file question on the form. */
  question: string;
  operator: FormRuleOperator;
  /** What `equals` and `notEquals` compare with. A checkbox answer is `true` or `false`. */
  value?: string | null;
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
  /** `create` takes new records, `update` edits one through an edit link, `both` does either. */
  mode?: FormMode | null;
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
  /** File questions: how many files may be attached. */
  maxFiles?: number;
  /** File questions: the largest file accepted, in bytes. */
  maxFileSize?: number;
  /** File questions: accepted types, like `image/*`. Absent accepts any. */
  mimeTypes?: string[];
  /** Show the question only when these pass. Absent, it is always shown. */
  rules?: FormRule[];
  /** `any` when one passing rule is enough. Absent, every rule must pass. */
  match?: FormRuleMatch;
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
  /** Through an edit link: the record's current answers, by question key. */
  values?: Record<string, unknown>;
};

/**
 * The submit body: answers by question key, URL parameters by name, and the spam checks. With
 * files, send `multipart/form-data` with this object as JSON in the `_payload` part and each file
 * as a part named after its question.
 */
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

export type FormMode = 'both' | 'create' | 'update';

/** `req.context.formLink` while an edit link reads or updates its record. */
export type FormLinkContext = {
  /** The `form-links` row. */
  readonly id: number | string;
  readonly collection: string;
  readonly record: number | string;
};

/** A `form-links` row. Its token is never stored, only its hash, which no response carries. */
export type FormLinkDocument = {
  id: number | string;
  label?: string | null;
  form: number | string | FormDocument;
  collection: string;
  recordId: string;
  expiresAt: string;
  maxSubmissions?: number | null;
  submissions?: number | null;
  lastSubmittedAt?: string | null;
  revokedAt?: string | null;
  status?: FormLinkStatus;
};

export type FormLinkStatus = 'active' | 'expired' | 'revoked' | 'used up';

export type CreateFormLinkOptions = {
  /** The form's slug or ID. Its mode must be `update` or `both`. */
  form: number | string;
  /** The ID of the record in the form's collection that the link edits. */
  record: number | string;
  /** How long the link lasts, up to `links.maxExpiry`. Defaults to `links.defaultExpiry`. */
  expiresIn?: FormLinkDuration;
  /** How many saves the link allows. Unset, it works until it expires or is revoked. */
  maxSubmissions?: number | null;
  /** The request whose user makes the link. */
  req?: FrogBotRequest;
  /**
   * Skip the check that the user can update the record.
   *
   * @default false
   */
  overrideAccess?: boolean;
};

export type CreatedFormLink = {
  /** The page that opens the link. Shown once: only its hash is stored. */
  url: string;
  id: number | string;
  expiresAt: string;
};

declare module 'payload' {
  interface RequestContext {
    /** Set by `@frogbotai/plugin-forms` while an edit link reads or updates its record. */
    formLink?: FormLinkContext;
  }
}
