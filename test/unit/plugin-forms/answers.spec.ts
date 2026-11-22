import type { Field } from 'frogbot';
import { describe, expect, it } from 'vitest';

import { pickSubmission } from '../../../packages/plugins/plugin-forms/src/answers.js';
import {
  collectFields,
  type FormTarget,
} from '../../../packages/plugins/plugin-forms/src/questions.js';
import type {
  FormDocument,
  FormQuestionConfig,
} from '../../../packages/plugins/plugin-forms/src/types.js';

const target: FormTarget = {
  slug: 'signups',
  fields: collectFields([
    { name: 'email', type: 'email', required: true },
    { name: 'subscribe', type: 'checkbox' },
    { name: 'age', type: 'number' },
    { name: 'topics', type: 'select', hasMany: true, options: ['news', 'events'] },
    { name: 'reason', type: 'text' },
    { name: 'note', type: 'textarea' },
    { name: 'secret', type: 'text' },
  ] as Field[]),
};

const questions: FormQuestionConfig[] = [
  { field: 'email' },
  { field: 'subscribe' },
  { field: 'age' },
  { field: 'topics' },
  { field: 'reason', rules: [{ question: 'subscribe', operator: 'equals', value: 'true' }] },
  { field: 'note', rules: [{ question: 'reason', operator: 'hasValue' }] },
];

const form = { slug: 'signup', steps: [{ questions }] } as FormDocument;

const invalid = (field: string, message: string) => ({ field, message, code: 'invalid_answer' });

describe('pickSubmission', () => {
  it('refuses each wrong-typed answer to a shown question, naming what it got and what is allowed', () => {
    expect(
      pickSubmission(form, target, {
        data: { email: 5, subscribe: 'yes', age: 'forty', topics: [1] },
      }),
    ).toEqual({
      errors: [
        invalid('email', 'email: expected a string, got 5.'),
        invalid('subscribe', 'subscribe: expected a boolean, got "yes".'),
        invalid('age', 'age: expected a number or numeric string, got "forty".'),
        invalid('topics', 'topics: expected an array of strings, got [1].'),
      ],
    });
  });

  it('names the source question, not the question its rule hid, for the issue example', () => {
    expect(
      pickSubmission(form, target, { data: { subscribe: 'true', age: 'forty', reason: 'hi' } }),
    ).toEqual({
      errors: [
        invalid('subscribe', 'subscribe: expected a boolean, got "true".'),
        invalid('age', 'age: expected a number or numeric string, got "forty".'),
      ],
    });
  });

  it('keeps well-typed answers and reads a numeric string as a number', () => {
    expect(
      pickSubmission(form, target, {
        data: { email: 'a@b.co', subscribe: true, age: ' 42 ', topics: ['news'], reason: 'hi' },
      }),
    ).toEqual({
      data: { email: 'a@b.co', subscribe: true, age: 42, topics: ['news'], reason: 'hi' },
      ignored: [],
    });
  });

  it('treats null, undefined and an empty string as no answer, not a wrong type', () => {
    expect(
      pickSubmission(form, target, {
        data: { email: 'a@b.co', subscribe: null, age: '', topics: undefined, nope: '' },
      }),
    ).toEqual({ data: { email: 'a@b.co' }, ignored: [] });
  });

  it('ignores a hidden answer, wrong-typed or not, and names the rule that hid it', () => {
    expect(
      pickSubmission(form, target, {
        data: { email: 'a@b.co', subscribe: false, reason: 42, note: 'later' },
      }),
    ).toEqual({
      data: { email: 'a@b.co', subscribe: false },
      ignored: [
        { field: 'reason', reason: 'hidden: subscribe equals true' },
        { field: 'note', reason: 'hidden: reason hasValue' },
      ],
    });
  });

  it('lists only the rules that failed, and every rule when any one would do', () => {
    const many = {
      slug: 'signup',
      steps: [
        {
          questions: [
            { field: 'email' },
            { field: 'subscribe' },
            { field: 'age' },
            {
              field: 'reason',
              rules: [
                { question: 'subscribe', operator: 'equals', value: 'true' },
                { question: 'age', operator: 'notEquals', value: '3' },
              ],
            },
            {
              field: 'note',
              match: 'any',
              rules: [
                { question: 'subscribe', operator: 'equals', value: 'true' },
                { question: 'age', operator: 'equals', value: '3' },
              ],
            },
          ],
        },
      ],
    } as FormDocument;

    expect(
      pickSubmission(many, target, {
        data: { email: 'a@b.co', subscribe: false, age: 5, reason: 'x', note: 'y' },
      }),
    ).toEqual({
      data: { email: 'a@b.co', subscribe: false, age: 5 },
      ignored: [
        { field: 'reason', reason: 'hidden: subscribe equals true' },
        { field: 'note', reason: 'hidden: subscribe equals true, age equals 3' },
      ],
    });
  });

  it('lists answers to names that are not questions on the form', () => {
    expect(
      pickSubmission(form, target, { data: { email: 'a@b.co', emial: 'x', secret: 's' } }),
    ).toEqual({
      data: { email: 'a@b.co' },
      ignored: [
        { field: 'emial', reason: 'not a question on this form' },
        { field: 'secret', reason: 'not a question on this form' },
      ],
    });
  });

  it('cuts a long value in the message', () => {
    const result = pickSubmission(form, target, { data: { age: 'x'.repeat(300) } });

    expect(result).toEqual({
      errors: [
        invalid('age', `age: expected a number or numeric string, got "${'x'.repeat(99)}….`),
      ],
    });
  });

  it('clears an emptied answer on an edit and refuses a wrong-typed one', () => {
    expect(
      pickSubmission(
        form,
        target,
        { data: { age: null, reason: '' } },
        {
          edit: true,
          stored: { subscribe: true },
        },
      ),
    ).toEqual({ data: { age: null, reason: null }, ignored: [] });

    expect(pickSubmission(form, target, { data: { age: 'old' } }, { edit: true })).toEqual({
      errors: [invalid('age', 'age: expected a number or numeric string, got "old".')],
    });
  });
});
