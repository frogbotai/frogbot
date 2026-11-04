'use client';
import { type ReactNode, useId } from 'react';

import { Checkbox } from '../components/checkbox.js';
import { Input } from '../components/input.js';
import { Label } from '../components/label.js';
import { RadioGroup, RadioGroupItem } from '../components/radio-group.js';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/select.js';
import { Textarea } from '../components/textarea.js';
import type { FormQuestion as Question, FormValue } from './types.js';

export type FormQuestionProps = {
  question: Question;
  value: FormValue;
  error?: string;
  onChange: (value: FormValue) => void;
};

const INPUT_TYPES = { date: 'date', email: 'email', number: 'number', text: 'text' } as const;

function Options({
  labelId,
  describedBy,
  children,
}: {
  labelId: string;
  describedBy?: string;
  children: ReactNode;
}) {
  return (
    <div
      aria-describedby={describedBy}
      aria-labelledby={labelId}
      className="fb-form__options"
      role="group"
    >
      {children}
    </div>
  );
}

/** One question: its label, description, control and error. */
export function FormQuestion({ question, value, error, onChange }: FormQuestionProps) {
  const id = useId();
  const labelId = `${id}-label`;
  const descriptionId = question.description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(' ') || undefined;
  const invalid = Boolean(error);
  const options = question.options ?? [];
  const text = typeof value === 'string' ? value : '';

  const shared = {
    id,
    name: question.key,
    'aria-describedby': describedBy,
    'aria-invalid': invalid || undefined,
    'aria-required': question.required || undefined,
  };

  const label = (
    <Label className="fb-form__label" htmlFor={id} id={labelId}>
      {question.label}
      {question.required ? (
        <span aria-hidden="true" className="fb-form__required">
          *
        </span>
      ) : null}
    </Label>
  );

  let control: ReactNode;

  if (question.type === 'checkbox') {
    control = (
      <div className="fb-form__option">
        <Checkbox
          {...shared}
          checked={value === true}
          onCheckedChange={(checked) => onChange(checked === true)}
        />
        {label}
      </div>
    );
  } else if (question.type === 'textarea') {
    control = (
      <Textarea
        {...shared}
        placeholder={question.placeholder}
        value={text}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  } else if (question.type === 'radio') {
    control = (
      <RadioGroup
        {...shared}
        aria-labelledby={labelId}
        className="fb-form__options"
        value={text}
        onValueChange={onChange}
      >
        {options.map((option, index) => (
          <div className="fb-form__option" key={option.value}>
            <RadioGroupItem id={`${id}-${index}`} value={option.value} />
            <Label htmlFor={`${id}-${index}`}>{option.label}</Label>
          </div>
        ))}
      </RadioGroup>
    );
  } else if (question.type === 'select' && question.hasMany) {
    const selected = Array.isArray(value) ? value : [];

    control = (
      <Options describedBy={describedBy} labelId={labelId}>
        {options.map((option, index) => (
          <div className="fb-form__option" key={option.value}>
            <Checkbox
              checked={selected.includes(option.value)}
              id={`${id}-${index}`}
              name={question.key}
              value={option.value}
              onCheckedChange={(checked) =>
                onChange(
                  checked === true
                    ? [...selected, option.value]
                    : selected.filter((item) => item !== option.value),
                )
              }
            />
            <Label htmlFor={`${id}-${index}`}>{option.label}</Label>
          </div>
        ))}
      </Options>
    );
  } else if (question.type === 'select') {
    control = (
      <Select name={question.key} value={text} onValueChange={onChange}>
        <SelectTrigger {...shared} aria-labelledby={labelId} className="fb-form__select">
          <SelectValue placeholder={question.placeholder ?? 'Select…'} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  } else {
    control = (
      <Input
        {...shared}
        inputMode={question.type === 'number' ? 'decimal' : undefined}
        placeholder={question.placeholder}
        type={INPUT_TYPES[question.type]}
        value={text}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  return (
    <div className="fb-form__question" data-question={question.key}>
      {question.type === 'checkbox' ? null : label}
      {question.description ? (
        <p className="fb-form__description" id={descriptionId}>
          {question.description}
        </p>
      ) : null}
      {control}
      {error ? (
        <p className="fb-form__error" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
