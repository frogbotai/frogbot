'use client';

import { type KeyboardEvent, memo, useCallback, useId, useMemo, useRef, useState } from 'react';

import { Popover, PopoverContent, PopoverTrigger } from '../components/popover.js';
import { SearchInput } from '../components/search-input.js';
import { Slider } from '../components/slider.js';
import { CheckIcon } from '../icons/check.js';
import ChevronLeftIcon from '../icons/icons/ChevronLeftIcon.js';
import ChevronRightIcon from '../icons/icons/ChevronRightIcon.js';
import { compactModelSearch, matchesModelSearch, normalizeModelSearch } from './model-search.js';
import { ProviderLogo } from './provider-logo.js';

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
  const [query, setQuery] = useState('');

  if (!models?.length) return null;

  const selected = models.find(({ id }) => id === selectedModelId);
  const name = selected?.name ?? selectedModelId;
  const reasoning = selected?.reasoning ?? [];
  const stops = ['Default', ...reasoning.map(({ label }) => label)];
  const level = reasoning.findIndex(({ key }) => key === selectedReasoning) + 1;

  const showView = (next: ModelSelectorView) => {
    setQuery('');
    setView(next);
  };

  const chooseModel = (id: string) => {
    if (id !== selectedModelId) onModelChange(id);

    showView('controls');
  };

  return (
    <Popover
      onOpenChange={(open) => {
        if (open) showView('controls');
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
      <PopoverContent
        align="start"
        side="top"
        className="fb-model-selector__content"
        onEscapeKeyDown={(event) => {
          if (!query) return;

          event.preventDefault();
          setQuery('');
        }}
      >
        {view === 'controls' ? (
          <ModelSelectorControls
            name={name}
            stops={stops}
            level={level}
            onOpenList={() => showView('list')}
            onLevelChange={(index) =>
              onReasoningChange(index === 0 ? undefined : reasoning[index - 1].key)
            }
          />
        ) : (
          <ModelSelectorList
            models={models}
            selectedModelId={selectedModelId}
            query={query}
            onQueryChange={setQuery}
            onBack={() => showView('controls')}
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
  query,
  onQueryChange,
  onBack,
  onChoose,
}: {
  models: readonly ModelSelectorModel[];
  selectedModelId: string;
  query: string;
  onQueryChange: (query: string) => void;
  onBack: () => void;
  onChoose: (id: string) => void;
}) {
  const groupId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const hasFocused = useRef(false);

  const focusInitialOption = useCallback((node: HTMLButtonElement | null) => {
    if (!node || hasFocused.current) return;

    hasFocused.current = true;
    node.focus();
  }, []);

  const searchableModels = useMemo(
    () =>
      models.map((model) => ({
        model,
        values: [model.name, model.id, model.provider ?? ''].map((value) => ({
          normalized: normalizeModelSearch(value),
          compact: compactModelSearch(value),
        })),
      })),
    [models],
  );

  const nameCounts = useMemo(
    () =>
      models.reduce(
        (result, { name }) => result.set(name, (result.get(name) ?? 0) + 1),
        new Map<string, number>(),
      ),
    [models],
  );

  const filteredModels = searchableModels
    .filter(({ values }) => matchesModelSearch(query, values))
    .map(({ model }) => model);

  const groups = filteredModels.reduce<Map<string | undefined, ModelSelectorModel[]>>(
    (result, model) => result.set(model.provider, [...(result.get(model.provider) ?? []), model]),
    new Map(),
  );

  const hasSelection = models.some(({ id }) => id === selectedModelId);
  const hasGroups = new Set(models.map(({ provider }) => provider)).size > 1;
  const count = filteredModels.length;
  const status = count ? `${count} ${count === 1 ? 'model' : 'models'}` : 'No models found';

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const input = inputRef.current;

    if (!input || event.nativeEvent.isComposing || event.key === 'Process') return;

    const options = [
      ...(listRef.current?.querySelectorAll<HTMLButtonElement>('.fb-model-selector__option') ?? []),
    ];

    if (event.target === input) {
      if (event.key === 'ArrowDown' && options.length) {
        event.preventDefault();
        options[0].focus();
      }

      if (event.key === 'Enter' && count) {
        event.preventDefault();
        onChoose(filteredModels[0].id);
      }

      return;
    }

    const index = options.indexOf(event.target as HTMLButtonElement);

    if (index !== -1 && event.key === 'ArrowDown') {
      event.preventDefault();
      options[index + 1]?.focus();

      return;
    }

    if (index !== -1 && event.key === 'ArrowUp') {
      event.preventDefault();
      (options[index - 1] ?? input).focus();

      return;
    }

    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const printable = [...event.key].length === 1 && event.key !== ' ';

    if (!printable && event.key !== 'Backspace') return;

    event.preventDefault();
    input.focus();
    onQueryChange(printable ? query + event.key : [...query].slice(0, -1).join(''));
  };

  const renderOption = (model: ModelSelectorModel) => {
    const current = model.id === selectedModelId;
    const duplicate = (nameCounts.get(model.name) ?? 0) > 1;

    return (
      <button
        key={model.id}
        ref={current ? focusInitialOption : undefined}
        type="button"
        className="fb-model-selector__option"
        title={model.id}
        aria-current={current || undefined}
        onClick={() => onChoose(model.id)}
      >
        <ProviderLogo provider={model.provider} />
        <span className="fb-model-selector__option-label">
          <span className="fb-model-selector__option-name">{model.name}</span>
          {duplicate ? <span className="fb-model-selector__option-id">{model.id}</span> : null}
        </span>
        {current ? <CheckIcon className="fb-model-selector__check" strokeWidth={4} /> : null}
      </button>
    );
  };

  return (
    <div className="fb-model-selector__list-view" onKeyDown={handleKeyDown}>
      <button
        ref={hasSelection ? undefined : focusInitialOption}
        type="button"
        className="fb-model-selector__back"
        onClick={onBack}
      >
        <ChevronLeftIcon className="fb-model-selector__icon" />
        <span>Back</span>
      </button>
      <SearchInput
        ref={inputRef}
        aria-label="Search models"
        placeholder="Search models"
        autoComplete="off"
        spellCheck={false}
        className="fb-model-selector__search"
        value={query}
        onChange={onQueryChange}
      />
      <div ref={listRef} className="fb-model-selector__list">
        {hasGroups
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
          : filteredModels.map(renderOption)}
        {count ? null : <div className="fb-model-selector__empty">No models found</div>}
      </div>
      <div role="status" aria-live="polite" className="fb-model-selector__status">
        {status}
      </div>
    </div>
  );
}
