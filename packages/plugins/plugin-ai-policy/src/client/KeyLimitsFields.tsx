'use client';

import './styles.css';

import { useCreateKeyData } from '@frogbotai/plugin-api-keys/client';
import { Checkbox, Input, Label } from '@frogbotai/ui';
import { useId } from 'react';

export type KeyLimitsFieldsProps = {
  models: string[];
  modelsDescription: string;
  budgetDescription: string;
};

export function KeyLimitsFields({
  budgetDescription,
  models,
  modelsDescription,
}: KeyLimitsFieldsProps) {
  const { data, setValue } = useCreateKeyData();
  const id = useId();
  const selected = Array.isArray(data.models) ? (data.models as string[]) : [];
  const budget = typeof data.monthlyBudget === 'number' ? String(data.monthlyBudget) : '';

  function toggle(model: string, checked: boolean) {
    setValue(
      'models',
      checked ? [...selected, model] : selected.filter((candidate) => candidate !== model),
    );
  }

  return (
    <>
      <fieldset className="ai-policy-key-limits__field">
        <legend className="ai-policy-key-limits__legend">Models</legend>
        <div className="ai-policy-key-limits__models">
          {models.map((model, index) => (
            <div className="ai-policy-key-limits__model" key={model}>
              <Checkbox
                checked={selected.includes(model)}
                id={`${id}-model-${index}`}
                onCheckedChange={(checked) => toggle(model, checked === true)}
              />
              <Label htmlFor={`${id}-model-${index}`}>{model}</Label>
            </div>
          ))}
        </div>
        <p className="ai-policy-key-limits__description">{modelsDescription}</p>
      </fieldset>
      <div className="ai-policy-key-limits__field">
        <Label htmlFor={`${id}-budget`}>Monthly Cap (USD)</Label>
        <Input
          id={`${id}-budget`}
          inputMode="decimal"
          min={0}
          step="0.01"
          type="number"
          value={budget}
          onChange={(event) =>
            setValue(
              'monthlyBudget',
              event.target.value === '' ? undefined : Number(event.target.value),
            )
          }
        />
        <p className="ai-policy-key-limits__description">{budgetDescription}</p>
      </div>
    </>
  );
}
