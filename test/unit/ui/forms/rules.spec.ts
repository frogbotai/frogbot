import { describe, expect, it } from 'vitest';

import {
  type RuleQuestion,
  visibleQuestions,
} from '../../../../packages/ui/src/exports/forms-rules.js';

function shown(questions: RuleQuestion[], answers: Record<string, unknown>): string[] {
  return [...visibleQuestions([{ questions }], answers)];
}

const business: RuleQuestion = { key: 'business', type: 'radio' };

describe('visibleQuestions', () => {
  it('shows a question without rules', () => {
    expect(shown([business, { key: 'note' }], {})).toEqual(['business', 'note']);
  });

  it('checks equals, notEquals and hasValue', () => {
    const questions: RuleQuestion[] = [
      business,
      { key: 'company', rules: [{ question: 'business', operator: 'equals', value: 'yes' }] },
      { key: 'why', rules: [{ question: 'business', operator: 'notEquals', value: 'yes' }] },
      { key: 'more', rules: [{ question: 'business', operator: 'hasValue' }] },
    ];

    expect(shown(questions, { business: 'yes' })).toEqual(['business', 'company', 'more']);
    expect(shown(questions, { business: 'no' })).toEqual(['business', 'why', 'more']);
  });

  it('treats an unanswered question as no answer', () => {
    const questions: RuleQuestion[] = [
      business,
      { key: 'company', rules: [{ question: 'business', operator: 'equals', value: 'yes' }] },
      { key: 'why', rules: [{ question: 'business', operator: 'notEquals', value: 'yes' }] },
      { key: 'more', rules: [{ question: 'business', operator: 'hasValue' }] },
    ];

    for (const empty of [undefined, null, '', '  ', [], false]) {
      expect(shown(questions, { business: empty })).toEqual(['business', 'why']);
    }
  });

  it('needs every rule by default, and one with any', () => {
    const rules = [
      { question: 'a', operator: 'equals' as const, value: '1' },
      { question: 'b', operator: 'equals' as const, value: '1' },
    ];

    const all: RuleQuestion[] = [{ key: 'a' }, { key: 'b' }, { key: 'c', rules }];
    const any: RuleQuestion[] = [{ key: 'a' }, { key: 'b' }, { key: 'c', rules, match: 'any' }];

    expect(shown(all, { a: '1', b: '2' })).not.toContain('c');
    expect(shown(all, { a: '1', b: '1' })).toContain('c');
    expect(shown(any, { a: '1', b: '2' })).toContain('c');
    expect(shown(any, { a: '2', b: '2' })).not.toContain('c');
  });

  it('compares numbers by value, so page strings and server numbers agree', () => {
    const questions: RuleQuestion[] = [
      { key: 'seats', type: 'number' },
      { key: 'team', rules: [{ question: 'seats', operator: 'equals', value: '5' }] },
    ];

    for (const seats of [5, '5', '05', '5.0']) {
      expect(shown(questions, { seats })).toContain('team');
    }

    expect(shown(questions, { seats: 'five' })).not.toContain('team');
  });

  it('compares a checkbox as true or false, and a list by any item', () => {
    const questions: RuleQuestion[] = [
      { key: 'terms', type: 'checkbox' },
      { key: 'topics', type: 'select' },
      { key: 'thanks', rules: [{ question: 'terms', operator: 'equals', value: 'true' }] },
      { key: 'billing', rules: [{ question: 'topics', operator: 'equals', value: 'billing' }] },
    ];

    expect(shown(questions, { terms: true, topics: ['sales', 'billing'] })).toEqual([
      'terms',
      'topics',
      'thanks',
      'billing',
    ]);
    expect(shown(questions, { terms: false, topics: ['sales'] })).toEqual(['terms', 'topics']);
  });

  it('reads a hidden, later or unknown question as unanswered, across steps', () => {
    const steps = [
      { questions: [business] },
      {
        questions: [
          { key: 'company', rules: [{ question: 'business', operator: 'equals', value: 'yes' }] },
          { key: 'size', rules: [{ question: 'company', operator: 'hasValue' }] },
          { key: 'early', rules: [{ question: 'late', operator: 'hasValue' }] },
          { key: 'late' },
          { key: 'ghost', rules: [{ question: 'nobody', operator: 'hasValue' }] },
        ] satisfies RuleQuestion[],
      },
    ];

    const answers = { business: 'no', company: 'Acme', late: 'x', nobody: 'y' };

    expect([...visibleQuestions(steps, answers)]).toEqual(['business', 'late']);
  });
});
