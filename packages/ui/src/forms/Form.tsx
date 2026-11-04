'use client';
import { type FormEvent, useMemo, useState } from 'react';

import { Button } from '../components/button.js';
import { FormQuestion } from './FormQuestion.js';
import { useTurnstile } from './turnstile.js';
import type {
  FormConfirmation,
  FormDefinition,
  FormFieldError,
  FormQuestion as Question,
  FormSubmitResponse,
  FormValue,
} from './types.js';

export type FormProps = {
  /** The form's render definition, from `GET /api/forms/<slug>/definition`. */
  definition: FormDefinition;
  /** Where answers are posted, such as `/api/forms/<slug>/submit`. */
  submitUrl: string;
  /** Called with the confirmation after a successful submit. When set, a redirect is left to you. */
  onSubmitted?: (confirmation: FormConfirmation) => void;
  className?: string;
};

const REQUIRED = 'This field is required.';
const FAILED = 'Something went wrong. Try again.';

function initialValue(question: Question): FormValue {
  const { defaultValue, hasMany, type } = question;

  if (type === 'checkbox') return defaultValue === true;

  if (type === 'select' && hasMany) {
    return Array.isArray(defaultValue)
      ? defaultValue.filter((item): item is string => typeof item === 'string')
      : [];
  }

  if (typeof defaultValue === 'string') return defaultValue;

  return typeof defaultValue === 'number' ? String(defaultValue) : '';
}

function isEmpty(value: FormValue): boolean {
  if (typeof value === 'boolean') return false;

  return Array.isArray(value) ? value.length === 0 : value.trim() === '';
}

function readParams(names: string[]): Record<string, string> {
  if (typeof window === 'undefined') return {};

  const search = new URLSearchParams(window.location.search);

  return Object.fromEntries(
    names.flatMap((name) => {
      const value = search.get(name);

      return value ? [[name, value]] : [];
    }),
  );
}

async function post(url: string, body: unknown): Promise<FormSubmitResponse> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  return (
    ((await response.json().catch(() => undefined)) as FormSubmitResponse | undefined) ?? {
      error: FAILED,
    }
  );
}

/** Renders a form definition step by step and posts the answers to `submitUrl`. */
export function Form({ definition, submitUrl, onSubmitted, className }: FormProps) {
  const { steps } = definition;
  const questions = useMemo(() => steps.flatMap((step) => step.questions), [steps]);

  const [values, setValues] = useState<Record<string, FormValue>>(() =>
    Object.fromEntries(questions.map((question) => [question.key, initialValue(question)])),
  );

  const [stepIndex, setStepIndex] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string>();
  const [trap, setTrap] = useState('');

  const step = steps[stepIndex];
  const isLast = stepIndex >= steps.length - 1;
  const turnstile = useTurnstile(definition.turnstile?.siteKey, isLast && !message);
  const classes = `fb-form${className ? ` ${className}` : ''}`;

  if (definition.closed || !step) {
    return (
      <section className={classes}>
        <h1 className="fb-form__title">{definition.title}</h1>
        <p className="fb-form__notice">This form is closed.</p>
      </section>
    );
  }

  if (message !== undefined) {
    return (
      <section className={classes}>
        <h1 className="fb-form__title">{definition.title}</h1>
        <p className="fb-form__notice" role="status">
          {message}
        </p>
      </section>
    );
  }

  const change = (key: string, value: FormValue) => {
    setValues((current) => ({ ...current, [key]: value }));

    setErrors(({ [key]: _removed, ...rest }) => rest);
  };

  const checkStep = (): boolean => {
    const missing = step.questions.filter(
      (question) => question.required && isEmpty(values[question.key] ?? ''),
    );

    if (missing.length === 0) return true;

    setErrors((current) => ({
      ...current,
      ...Object.fromEntries(missing.map(({ key }) => [key, REQUIRED])),
    }));

    return false;
  };

  const showErrors = (list: FormFieldError[]) => {
    const byField: Record<string, string> = {};
    const general: string[] = [];

    for (const { field, message: text } of list) {
      if (field && questions.some(({ key }) => key === field)) byField[field] ??= text;
      else general.push(text);
    }

    const first = steps.findIndex((item) => item.questions.some(({ key }) => key in byField));

    setErrors(byField);
    setFormErrors(general);

    if (first !== -1) setStepIndex(first);
  };

  const submit = async () => {
    if (definition.turnstile && !turnstile.token) {
      setFormErrors(['Complete the check above to send the form.']);

      return;
    }

    setSubmitting(true);
    setFormErrors([]);

    try {
      const result = await post(submitUrl, {
        data: values,
        params: readParams(definition.hiddenParams),
        ...(trap ? { honeypot: trap } : {}),
        ...(definition.turnstile ? { turnstile: turnstile.token } : {}),
      });

      if ('confirmation' in result) {
        onSubmitted?.(result.confirmation);

        if (result.confirmation.type === 'redirect' && !onSubmitted) {
          window.location.assign(result.confirmation.url);

          return;
        }

        setMessage(
          result.confirmation.type === 'message'
            ? result.confirmation.message
            : 'Thanks, your response has been sent.',
        );

        return;
      }

      turnstile.reset();

      if ('errors' in result) showErrors(result.errors);
      else setFormErrors([result.error || FAILED]);
    } catch {
      turnstile.reset();
      setFormErrors([FAILED]);
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (submitting || !checkStep()) return;

    if (!isLast) {
      setStepIndex(stepIndex + 1);
      setFormErrors([]);

      return;
    }

    void submit();
  };

  return (
    <form className={classes} noValidate onSubmit={onSubmit}>
      <h1 className="fb-form__title">{definition.title}</h1>
      {steps.length > 1 ? (
        <p className="fb-form__progress">
          Step {stepIndex + 1} of {steps.length}
        </p>
      ) : null}
      {step.title ? <h2 className="fb-form__step-title">{step.title}</h2> : null}
      {step.questions.map((question) => (
        <FormQuestion
          error={errors[question.key]}
          key={question.key}
          question={question}
          value={values[question.key] ?? ''}
          onChange={(value) => change(question.key, value)}
        />
      ))}
      <div aria-hidden="true" className="fb-form__trap">
        <input
          autoComplete="off"
          name={definition.honeypot}
          tabIndex={-1}
          type="text"
          value={trap}
          onChange={(event) => setTrap(event.target.value)}
        />
      </div>
      {definition.turnstile && isLast ? (
        <div className="fb-form__turnstile" ref={turnstile.ref} />
      ) : null}
      {formErrors.length ? (
        <div className="fb-form__alert" role="alert">
          {formErrors.map((text) => (
            <p key={text}>{text}</p>
          ))}
        </div>
      ) : null}
      <div className="fb-form__actions">
        {stepIndex > 0 ? (
          <Button
            disabled={submitting}
            type="button"
            variant="outline"
            onClick={() => setStepIndex(stepIndex - 1)}
          >
            Back
          </Button>
        ) : null}
        <Button disabled={submitting} type="submit">
          {isLast ? (submitting ? 'Sending…' : 'Submit') : 'Next'}
        </Button>
      </div>
    </form>
  );
}
