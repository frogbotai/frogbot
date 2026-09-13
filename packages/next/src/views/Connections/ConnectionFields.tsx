'use client';

import {
  Button,
  Checkbox,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@frogbotai/ui';
import { useId } from 'react';

import { initialConnectionValue } from './schema.js';
import type { ConnectionField } from './types.js';

export function ConnectionFields({
  field,
  label,
  value,
  onChange,
  optional = false,
}: {
  field: ConnectionField;
  label: string;
  value: unknown;
  onChange: (value: unknown) => void;
  optional?: boolean;
}) {
  const id = useId();
  const title = field.title ?? label;
  const present = value !== undefined && value !== null;
  const descriptionID = field.description ? `${id}-description` : undefined;
  const composite = field.type === 'object' || field.type === 'array';

  return (
    <div
      className="frogbot-connections__field"
      role={composite ? 'group' : undefined}
      aria-labelledby={composite ? `${id}-label` : undefined}
    >
      <div className="frogbot-connections__field-heading">
        <Label id={`${id}-label`} htmlFor={composite ? undefined : id}>
          {title}
        </Label>
        {(optional || field.nullable) && (
          <Select
            value={value === undefined ? 'omitted' : value === null ? 'null' : 'value'}
            onValueChange={(mode) =>
              onChange(
                mode === 'omitted'
                  ? undefined
                  : mode === 'null'
                    ? null
                    : initialConnectionValue(field),
              )
            }
          >
            <SelectTrigger
              aria-label={`${title} value mode`}
              className="frogbot-connections__presence"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {optional && <SelectItem value="omitted">Not provided</SelectItem>}
              <SelectItem value="value">Use value</SelectItem>
              {field.nullable && <SelectItem value="null">Null</SelectItem>}
            </SelectContent>
          </Select>
        )}
      </div>
      {field.description && (
        <p id={descriptionID} className="frogbot-connections__muted">
          {field.description}
        </p>
      )}
      {present && field.type === 'object' && (
        <div className="frogbot-connections__nested">
          {Object.entries(field.properties ?? {}).map(([key, child]) => (
            <ConnectionFields
              key={key}
              field={child}
              label={key}
              optional={!field.required?.includes(key)}
              value={
                Object.hasOwn(value as object, key)
                  ? (value as Record<string, unknown>)[key]
                  : undefined
              }
              onChange={(next) => onChange({ ...(value as Record<string, unknown>), [key]: next })}
            />
          ))}
        </div>
      )}
      {present && field.type === 'array' && (
        <div className="frogbot-connections__nested">
          {(value as unknown[]).map((item, index) => (
            <div className="frogbot-connections__array-item" key={index}>
              <ConnectionFields
                field={field.items!}
                label={`${title} ${index + 1}`}
                value={item}
                onChange={(next) =>
                  onChange(
                    (value as unknown[]).map((current, at) => (at === index ? next : current)),
                  )
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Remove ${title} ${index + 1}`}
                onClick={() => onChange((value as unknown[]).filter((_, at) => at !== index))}
              >
                Remove
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={field.maxItems !== undefined && (value as unknown[]).length >= field.maxItems}
            onClick={() =>
              onChange([...(value as unknown[]), initialConnectionValue(field.items!)])
            }
          >
            Add item
          </Button>
        </div>
      )}
      {present && field.choices && (
        <Select
          value={String(field.choices.findIndex((choice) => choice === value))}
          onValueChange={(index) => onChange(field.choices![Number(index)])}
        >
          <SelectTrigger id={id} aria-describedby={descriptionID}>
            <SelectValue placeholder="Choose a value" />
          </SelectTrigger>
          <SelectContent>
            {field.choices.map((choice, index) => (
              <SelectItem key={index} value={String(index)}>
                {String(choice) || '(empty string)'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {present && !field.choices && field.type === 'boolean' && (
        <Checkbox
          id={id}
          aria-describedby={descriptionID}
          checked={value === true}
          onCheckedChange={(checked) => onChange(checked === true)}
        />
      )}
      {present && !field.choices && ['string', 'number', 'integer'].includes(field.type) && (
        <Input
          id={id}
          aria-describedby={descriptionID}
          type="password"
          autoComplete="new-password"
          spellCheck={false}
          inputMode={
            field.type === 'integer' ? 'numeric' : field.type === 'number' ? 'decimal' : 'text'
          }
          value={String(value)}
          minLength={field.minLength}
          maxLength={field.maxLength}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  );
}
