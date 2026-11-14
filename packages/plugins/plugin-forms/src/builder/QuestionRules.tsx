'use client';

import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@frogbotai/ui';
import { useForm } from '@frogbotai/ui/admin';
import type { FormState } from 'payload';
import { useId } from 'react';

import type { FormFieldInfo } from '../definition.js';
import type { FormOption, FormRuleOperator } from '../types.js';

export type QuestionRulesProps = {
  /** The question row's path, like `steps.0.questions.2`. */
  path: string;
  /** The questions array's schema path. */
  schemaPath: string;
  state: FormState;
  /** The question's field, or `undefined` when the collection lacks it. */
  info: FormFieldInfo | undefined;
  /** The questions before this one, which its rules may check. */
  earlier: FormFieldInfo[];
  readOnly?: boolean;
};

const OPERATORS: { label: string; value: FormRuleOperator }[] = [
  { label: 'is', value: 'equals' },
  { label: 'is not', value: 'notEquals' },
  { label: 'has an answer', value: 'hasValue' },
];

const CHECKBOX_OPTIONS: FormOption[] = [
  { label: 'Checked', value: 'true' },
  { label: 'Not checked', value: 'false' },
];

function text(state: FormState, path: string): string {
  const value = state[path]?.value;

  return typeof value === 'string' ? value : '';
}

function optionsFor(info: FormFieldInfo | undefined): FormOption[] | undefined {
  if (!info || 'refusal' in info) return;
  if (info.type === 'checkbox') return CHECKBOX_OPTIONS;

  return info.options;
}

function Choice({
  label,
  onChange,
  options,
  readOnly,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: FormOption[];
  readOnly?: boolean;
  value: string;
}) {
  const known = !value || options.some((option) => option.value === value);
  const all = known ? options : [...options, { label: `${value} (not on the form)`, value }];

  return (
    <Select disabled={readOnly} onValueChange={onChange} value={value || undefined}>
      <SelectTrigger aria-label={label} className="fb-form-builder__rule-select">
        <SelectValue placeholder="Choose" />
      </SelectTrigger>
      <SelectContent>
        {all.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * A question's "Show when" rules: each checks the answer to an earlier, non-file question. It
 * edits the question row's `rules` and `match` in the document form, so saving checks them.
 */
export function QuestionRules({
  earlier,
  info,
  path,
  readOnly,
  schemaPath,
  state,
}: QuestionRulesProps) {
  const { addFieldRow, dispatchFields, removeFieldRow, setModified } = useForm();
  const headingId = useId();
  const rulesPath = `${path}.rules`;
  const rows = state[rulesPath]?.rows ?? [];
  const sources = earlier.filter((field) => !('refusal' in field) && field.type !== 'upload');
  const byName = new Map(sources.map((field) => [field.name, field]));

  const set = (fieldPath: string, value: string) => {
    dispatchFields({ type: 'UPDATE', path: fieldPath, value });
    setModified(true);
  };

  const add = () => {
    const first = sources[0]?.name ?? '';

    addFieldRow({
      path: rulesPath,
      rowIndex: rows.length,
      schemaPath: `${schemaPath}.rules`,
      subFieldState: {
        question: { initialValue: first, valid: true, value: first },
        operator: { initialValue: 'equals', valid: true, value: 'equals' },
        value: { initialValue: '', valid: true, value: '' },
      },
    });
  };

  if (info?.required && rows.length === 0) {
    return (
      <p className="fb-form-builder__note">
        Required questions are always shown, so they can&apos;t have rules.
      </p>
    );
  }

  const error = state[rulesPath]?.valid === false ? state[rulesPath]?.errorMessage : undefined;

  return (
    <div aria-labelledby={headingId} className="fb-form-builder__rules" role="group">
      <p className="fb-form-builder__rules-title" id={headingId}>
        Show when
      </p>
      {rows.length === 0 && (
        <p className="fb-form-builder__note">
          {sources.length
            ? 'Always shown.'
            : 'Always shown. Add a question before this one to show it only for some answers.'}
        </p>
      )}
      {rows.length > 1 && (
        <Choice
          label="Match"
          onChange={(value) => set(`${path}.match`, value)}
          options={[
            { label: 'Every rule passes', value: 'all' },
            { label: 'Any rule passes', value: 'any' },
          ]}
          readOnly={readOnly}
          value={text(state, `${path}.match`) || 'all'}
        />
      )}
      <ul className="fb-form-builder__rule-list">
        {rows.map((row, index) => {
          const rulePath = `${rulesPath}.${index}`;
          const source = text(state, `${rulePath}.question`);
          const operator = text(state, `${rulePath}.operator`) || 'equals';
          const value = text(state, `${rulePath}.value`);
          const options = optionsFor(byName.get(source));
          const problems = ['question', 'operator', 'value'].flatMap((name) => {
            const field = state[`${rulePath}.${name}`];

            return field?.valid === false && field.errorMessage ? [field.errorMessage] : [];
          });

          return (
            <li className="fb-form-builder__rule" key={row.id}>
              <Choice
                label={`Rule ${index + 1} question`}
                onChange={(next) => {
                  set(`${rulePath}.question`, next);
                  set(`${rulePath}.value`, '');
                }}
                options={sources.map((field) => ({ label: field.label, value: field.name }))}
                readOnly={readOnly}
                value={source}
              />
              <Choice
                label={`Rule ${index + 1} check`}
                onChange={(next) => set(`${rulePath}.operator`, next)}
                options={OPERATORS}
                readOnly={readOnly}
                value={operator}
              />
              {operator !== 'hasValue' &&
                (options ? (
                  <Choice
                    label={`Rule ${index + 1} answer`}
                    onChange={(next) => set(`${rulePath}.value`, next)}
                    options={options}
                    readOnly={readOnly}
                    value={value}
                  />
                ) : (
                  <Input
                    aria-label={`Rule ${index + 1} answer`}
                    className="fb-form-builder__rule-value"
                    disabled={readOnly}
                    onChange={(event) => set(`${rulePath}.value`, event.target.value)}
                    placeholder="Answer"
                    value={value}
                  />
                ))}
              <Button
                aria-label={`Remove rule ${index + 1}`}
                disabled={readOnly}
                onClick={() => removeFieldRow({ path: rulesPath, rowIndex: index })}
                size="sm"
                type="button"
                variant="ghost"
              >
                Remove
              </Button>
              {problems.map((problem) => (
                <p className="fb-form-builder__warning" key={problem} role="alert">
                  {problem}
                </p>
              ))}
            </li>
          );
        })}
      </ul>
      {error && (
        <p className="fb-form-builder__warning" role="alert">
          {error}
        </p>
      )}
      {sources.length > 0 && !info?.required && (
        <Button disabled={readOnly} onClick={add} size="sm" type="button" variant="outline">
          Add rule
        </Button>
      )}
    </div>
  );
}
