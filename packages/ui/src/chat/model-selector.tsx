'use client';

import { memo } from 'react';

import { Button } from '../components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '../components/dropdown-menu';
import { CheckIcon } from '../icons/check';
import ChevronDownIcon from '../icons/icons/ChevronDownIcon';
import ChevronRightIcon from '../icons/icons/ChevronRightIcon';

export type ModelSelectorModel = {
  id: string;
  name: string;
  provider?: string;
};

export type ModelSelectorProps = {
  models?: readonly ModelSelectorModel[];
  selectedModelId?: string;
  onModelChange: (id: string | undefined) => void;
};

export const ModelSelector = memo(function ModelSelector({
  models,
  selectedModelId,
  onModelChange,
}: ModelSelectorProps) {
  if (!models?.length) return null;
  const selected = models.find(({ id }) => id === selectedModelId);
  const providers = models.reduce<Map<string, ModelSelectorModel[]>>((groups, model) => {
    const provider = model.provider ?? 'Other';
    groups.set(provider, [...(groups.get(provider) ?? []), model]);
    return groups;
  }, new Map());

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="fb-model-selector__trigger">
          <span className="fb-model-selector__selected">{selected?.name ?? 'Default'}</span>
          <ChevronDownIcon className="fb-model-selector__icon" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="fb-model-selector__content">
        <DropdownMenuItem
          onSelect={() => onModelChange(undefined)}
          className="fb-model-selector__item"
        >
          <span className="fb-model-selector__label">Default</span>
          {selectedModelId === undefined ? (
            <CheckIcon className="fb-model-selector__check" strokeWidth={4} />
          ) : null}
        </DropdownMenuItem>
        {[...providers].map(([provider, providerModels]) => (
          <DropdownMenuSub key={provider}>
            <DropdownMenuSubTrigger className="fb-model-selector__sub-trigger">
              <span className="fb-model-selector__label">{provider}</span>
              <ChevronRightIcon className="fb-model-selector__icon" />
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="fb-model-selector__sub-content">
              {providerModels.map((model) => (
                <DropdownMenuItem
                  key={model.id}
                  onSelect={() => onModelChange(model.id)}
                  className="fb-model-selector__item"
                >
                  <span className="fb-model-selector__model-name">{model.name}</span>
                  {model.id === selectedModelId ? (
                    <CheckIcon
                      className="fb-model-selector__check fb-model-selector__check--fixed"
                      strokeWidth={4}
                    />
                  ) : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});
