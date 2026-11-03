import { type Option, optionIsObject } from 'frogbot';

import type { FieldCatalog, QuestionField } from './questions.js';
import type {
  FormConfirmation,
  FormDefinition,
  FormDocument,
  FormOption,
  FormQuestion,
  FormQuestionConfig,
} from './types.js';

export const DEFAULT_CONFIRMATION = 'Thanks, your response has been sent.';

type Label = string | Record<string, string> | false | ((...args: never[]) => unknown) | undefined;

function staticText(value: Label, language: string | undefined): string | undefined {
  if (typeof value === 'string') return value || undefined;
  if (!value || typeof value !== 'object') return;

  return (language ? value[language] : undefined) ?? Object.values(value)[0];
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
    label: staticText(option.label as Label, language) ?? option.value,
    value: option.value,
  };
}

function buildQuestion(
  config: FormQuestionConfig,
  field: QuestionField,
  language: string | undefined,
): FormQuestion {
  const admin = (field.admin ?? {}) as { description?: Label; placeholder?: Label };

  const question: FormQuestion = {
    key: field.name,
    type: field.type,
    label: config.label || staticText(field.label, language) || humanize(field.name),
    required: field.required === true,
  };

  const description = config.description || staticText(admin.description, language);
  const placeholder = config.placeholder || staticText(admin.placeholder, language);

  if (description) question.description = description;
  if (placeholder) question.placeholder = placeholder;

  if (field.type === 'select' || field.type === 'radio') {
    question.options = field.options.map((option) => toOption(option, language));
  }

  if (field.type === 'select' && field.hasMany) question.hasMany = true;

  if (field.defaultValue !== undefined && typeof field.defaultValue !== 'function') {
    question.defaultValue = field.defaultValue;
  }

  return question;
}

export function buildConfirmation(form: FormDocument): FormConfirmation {
  const { confirmation } = form;

  if (confirmation?.type === 'redirect' && confirmation.redirect) {
    return { type: 'redirect', url: confirmation.redirect };
  }

  return { type: 'message', message: confirmation?.message || DEFAULT_CONFIRMATION };
}

/** The render definition of a saved form: its steps and questions, never the target's other fields. */
export function buildDefinition({
  form,
  fields,
  closed,
  language,
}: {
  form: FormDocument;
  fields: FieldCatalog;
  closed: boolean;
  language?: string;
}): FormDefinition {
  const steps = (form.steps ?? []).map((step) => {
    const questions = (step.questions ?? []).flatMap((config) => {
      const entry = fields.get(config.field);

      return entry && 'field' in entry ? [buildQuestion(config, entry.field, language)] : [];
    });

    return step.title ? { title: step.title, questions } : { questions };
  });

  return {
    slug: form.slug,
    title: form.title,
    steps,
    hiddenParams: (form.hiddenParams ?? []).map(({ name }) => name),
    confirmation: buildConfirmation(form),
    closed,
  };
}
