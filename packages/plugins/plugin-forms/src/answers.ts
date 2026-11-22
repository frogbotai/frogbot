import { type FormRule, rulePasses, visibleQuestions } from '@frogbotai/ui/forms/rules';

import type { FormTarget, QuestionField } from './questions.js';
import type {
  FormDocument,
  FormFieldError,
  FormIgnoredAnswer,
  FormQuestionConfig,
} from './types.js';

export const PARAM_MAX_LENGTH = 500;

const VALUE_MAX_LENGTH = 100;

type Question = { name: string; field: QuestionField; config: FormQuestionConfig };

type Checked = { value: unknown } | { expected: string };

type RuleState = { answers: Record<string, unknown>; shown: Set<string> };

/** The answers to keep and the ones ignored, or every wrong-typed answer to a shown question. */
export type PickedSubmission =
  { errors: FormFieldError[] } | { data: Record<string, unknown>; ignored: FormIgnoredAnswer[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

function unanswered(value: unknown): boolean {
  return isEmpty(value) || (Array.isArray(value) && value.length === 0);
}

function checkAnswer(field: QuestionField, value: unknown): Checked | undefined {
  if (isEmpty(value)) return;

  if (field.type === 'checkbox') {
    return typeof value === 'boolean' ? { value } : { expected: 'a boolean' };
  }

  if (field.type === 'number') {
    const number = typeof value === 'string' && value.trim() ? Number(value) : value;

    return typeof number === 'number' && Number.isFinite(number)
      ? { value: number }
      : { expected: 'a number or numeric string' };
  }

  if (field.type === 'select' && field.hasMany) {
    return Array.isArray(value) && value.every((item) => typeof item === 'string')
      ? { value }
      : { expected: 'an array of strings' };
  }

  return typeof value === 'string' ? { value } : { expected: 'a string' };
}

function questionsOf(form: FormDocument, target: FormTarget): Question[] {
  return (form.steps ?? [])
    .flatMap((step) => step.questions ?? [])
    .flatMap((config) => {
      const entry = target.fields.get(config.field);

      return entry && 'field' in entry ? [{ name: config.field, field: entry.field, config }] : [];
    });
}

export function bodyAnswers(body: unknown): Record<string, unknown> {
  return isRecord(body) && isRecord(body.data) ? body.data : {};
}

function cleanAnswers(
  questions: Question[],
  answers: Record<string, unknown>,
): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};

  for (const { name, field } of questions) {
    if (field.type === 'upload' || !Object.hasOwn(answers, name)) continue;

    const checked = checkAnswer(field, answers[name]);

    if (checked && 'value' in checked) cleaned[name] = checked.value;
  }

  return cleaned;
}

function ruleState(
  form: FormDocument,
  target: FormTarget,
  body: unknown,
  stored: Record<string, unknown>,
): RuleState {
  const questions = questionsOf(form, target);
  const sent = bodyAnswers(body);
  const merged = cleanAnswers(questions, stored);

  for (const name of Object.keys(sent)) delete merged[name];

  const answers = { ...merged, ...cleanAnswers(questions, sent) };

  const steps = (form.steps ?? []).map((step) => ({
    questions: (step.questions ?? []).map(({ field, rules, match }) => {
      const entry = target.fields.get(field);
      const usable = entry && 'field' in entry ? entry.field : undefined;

      return {
        key: field,
        type: usable?.type,
        rules: usable?.required === true ? [] : ruleList(rules),
        match: match ?? undefined,
      };
    }),
  }));

  return { answers, shown: visibleQuestions(steps, answers) };
}

function ruleList(rules: FormQuestionConfig['rules']): FormRule[] {
  return (rules ?? []).map(({ question, operator, value }) => ({
    question,
    operator,
    value: value ?? '',
  }));
}

function hiddenReason(question: Question, questions: Question[], state: RuleState): string {
  const failed = ruleList(question.config.rules).filter(
    (rule) =>
      !rulePasses(
        rule,
        state.shown.has(rule.question) ? state.answers[rule.question] : undefined,
        questions.find(({ name }) => name === rule.question)?.field.type,
      ),
  );

  const rules = failed.map(({ question: source, operator, value }) =>
    operator === 'hasValue' ? `${source} hasValue` : `${source} ${operator} ${value}`,
  );

  return rules.length ? `hidden: ${rules.join(', ')}` : 'hidden';
}

function written(value: unknown): string {
  const text = JSON.stringify(value);

  return text.length > VALUE_MAX_LENGTH ? `${text.slice(0, VALUE_MAX_LENGTH)}…` : text;
}

/**
 * The questions the visitor saw, by the same rules the page runs, from their well-typed answers
 * over `stored`. A question whose field is required is always shown, even if a saved rule says
 * otherwise.
 */
export function shownQuestions(
  form: FormDocument,
  target: FormTarget,
  body: unknown,
  stored: Record<string, unknown> = {},
): Set<string> {
  return ruleState(form, target, body, stored).shown;
}

/**
 * Checks the answers against the form. A wrong-typed answer to a shown question is an
 * `invalid_answer` error. Otherwise it keeps the answers to shown questions and the form's declared
 * parameters, and lists every other non-empty answer in `ignored`: a hidden question's with the
 * rules that hid it, a name that is no question on the form as such. For an edit (`edit`), there are
 * no parameters, an emptied answer clears its field, and rules also read the record's `stored`
 * answers that the body leaves out. Upload answers are left to the file checks.
 */
export function pickSubmission(
  form: FormDocument,
  target: FormTarget,
  body: unknown,
  { edit = false, stored = {} }: { edit?: boolean; stored?: Record<string, unknown> } = {},
): PickedSubmission {
  const answers = bodyAnswers(body);
  const questions = questionsOf(form, target);
  const state = ruleState(form, target, body, stored);
  const data: Record<string, unknown> = {};
  const ignored: FormIgnoredAnswer[] = [];
  const errors: FormFieldError[] = [];

  for (const question of questions) {
    const { name, field } = question;
    if (field.type === 'upload' || !Object.hasOwn(answers, name)) continue;

    const checked = checkAnswer(field, answers[name]);

    if (!state.shown.has(name)) {
      if (!unanswered(answers[name])) {
        ignored.push({ field: name, reason: hiddenReason(question, questions, state) });
      }
    } else if (!checked) {
      if (edit) data[name] = null;
    } else if ('expected' in checked) {
      errors.push({
        field: name,
        message: `${name}: expected ${checked.expected}, got ${written(answers[name])}.`,
        code: 'invalid_answer',
      });
    } else data[name] = checked.value;
  }

  if (errors.length) return { errors };

  const asked = new Set(questions.map(({ name }) => name));

  for (const [name, value] of Object.entries(answers)) {
    if (!asked.has(name) && !unanswered(value)) {
      ignored.push({ field: name, reason: 'not a question on this form' });
    }
  }

  if (edit) return { data, ignored };

  const params = isRecord(body) && isRecord(body.params) ? body.params : {};

  for (const { name, field } of form.hiddenParams ?? []) {
    const value = Object.hasOwn(params, name) ? params[name] : undefined;

    if (typeof value === 'string' && value) data[field] = value.slice(0, PARAM_MAX_LENGTH);
  }

  return { data, ignored };
}
