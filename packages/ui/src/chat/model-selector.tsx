'use client';

import { memo, useId, useState } from 'react';

import { Popover, PopoverContent, PopoverTrigger } from '../components/popover.js';
import { Slider } from '../components/slider.js';
import { CheckIcon } from '../icons/check.js';
import ChevronLeftIcon from '../icons/icons/ChevronLeftIcon.js';
import ChevronRightIcon from '../icons/icons/ChevronRightIcon.js';

export type ModelSelectorReasoning = {
  key: string;
  label: string;
};

export type ModelSelectorModel = {
  id: string;
  name: string;
  provider?: string;
  reasoning?: readonly ModelSelectorReasoning[];
};

export type ModelSelectorProps = {
  models?: readonly ModelSelectorModel[];
  selectedModelId: string;
  selectedReasoning?: string;
  onModelChange: (id: string) => void;
  onReasoningChange: (key: string | undefined) => void;
};

type ModelSelectorView = 'controls' | 'list';

const focusOnMount = (node: HTMLElement | null) => {
  node?.focus();
};

export const ModelSelector = memo(function ModelSelector({
  models,
  selectedModelId,
  selectedReasoning,
  onModelChange,
  onReasoningChange,
}: ModelSelectorProps) {
  const [view, setView] = useState<ModelSelectorView>('controls');

  if (!models?.length) return null;

  const selected = models.find(({ id }) => id === selectedModelId);
  const name = selected?.name ?? selectedModelId;
  const reasoning = selected?.reasoning ?? [];
  const stops = ['Default', ...reasoning.map(({ label }) => label)];
  const level = reasoning.findIndex(({ key }) => key === selectedReasoning) + 1;

  const chooseModel = (id: string) => {
    if (id !== selectedModelId) onModelChange(id);

    setView('controls');
  };

  return (
    <Popover
      onOpenChange={(open) => {
        if (open) setView('controls');
      }}
    >
      <PopoverTrigger asChild>
        <button type="button" className="fb-model-selector__trigger">
          <span className="fb-model-selector__name">{name}</span>
          {reasoning.length ? (
            <>
              {' '}
              <span className="fb-model-selector__level">· {stops[level]}</span>
            </>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="fb-model-selector__content">
        {view === 'controls' ? (
          <ModelSelectorControls
            name={name}
            stops={stops}
            level={level}
            onOpenList={() => setView('list')}
            onLevelChange={(index) =>
              onReasoningChange(index === 0 ? undefined : reasoning[index - 1].key)
            }
          />
        ) : (
          <ModelSelectorList
            models={models}
            selectedModelId={selectedModelId}
            onBack={() => setView('controls')}
            onChoose={chooseModel}
          />
        )}
      </PopoverContent>
    </Popover>
  );
});

function ModelSelectorControls({
  name,
  stops,
  level,
  onOpenList,
  onLevelChange,
}: {
  name: string;
  stops: readonly string[];
  level: number;
  onOpenList: () => void;
  onLevelChange: (index: number) => void;
}) {
  const captionId = useId();

  return (
    <>
      <button
        ref={focusOnMount}
        type="button"
        className="fb-model-selector__model"
        aria-label={`${name}, change model`}
        onClick={onOpenList}
      >
        <span className="fb-model-selector__model-name">{name}</span>
        <ChevronRightIcon className="fb-model-selector__icon" />
      </button>
      {stops.length > 1 ? (
        <div className="fb-model-selector__reasoning">
          <span id={captionId} className="fb-model-selector__caption">
            Reasoning
          </span>
          <Slider
            aria-labelledby={captionId}
            stops={stops}
            value={level}
            onValueChange={onLevelChange}
          />
        </div>
      ) : null}
    </>
  );
}

function ModelSelectorList({
  models,
  selectedModelId,
  onBack,
  onChoose,
}: {
  models: readonly ModelSelectorModel[];
  selectedModelId: string;
  onBack: () => void;
  onChoose: (id: string) => void;
}) {
  const groupId = useId();

  const groups = models.reduce<Map<string | undefined, ModelSelectorModel[]>>(
    (result, model) => result.set(model.provider, [...(result.get(model.provider) ?? []), model]),
    new Map(),
  );

  const hasSelection = models.some(({ id }) => id === selectedModelId);

  const renderOption = (model: ModelSelectorModel) => {
    const current = model.id === selectedModelId;

    return (
      <button
        key={model.id}
        ref={current ? focusOnMount : undefined}
        type="button"
        className="fb-model-selector__option"
        aria-current={current || undefined}
        onClick={() => onChoose(model.id)}
      >
        <span className="fb-model-selector__option-name">{model.name}</span>
        {current ? <CheckIcon className="fb-model-selector__check" strokeWidth={4} /> : null}
      </button>
    );
  };

  return (
    <>
      <button
        ref={hasSelection ? undefined : focusOnMount}
        type="button"
        className="fb-model-selector__back"
        onClick={onBack}
      >
        <ChevronLeftIcon className="fb-model-selector__icon" />
        <span>Back</span>
      </button>
      <div className="fb-model-selector__list">
        {groups.size > 1
          ? [...groups].map(([provider, providerModels], index) => (
              <div
                key={provider ?? ''}
                role="group"
                aria-labelledby={`${groupId}-${index}`}
                className="fb-model-selector__group"
              >
                <span id={`${groupId}-${index}`} className="fb-model-selector__group-label">
                  {provider ?? 'Other'}
                </span>
                {providerModels.map(renderOption)}
              </div>
            ))
          : models.map(renderOption)}
      </div>
    </>
  );
}
