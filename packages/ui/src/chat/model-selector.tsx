'use client'

import { memo } from 'react'

import { Button } from '../components/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '../components/dropdown-menu'
import { CheckIcon } from '../icons/check'
import ChevronDownIcon from '../icons/icons/ChevronDownIcon'
import ChevronRightIcon from '../icons/icons/ChevronRightIcon'

export type ModelSelectorModel = {
  id: string
  name: string
  provider?: string
}

export type ModelSelectorProps = {
  models?: readonly ModelSelectorModel[]
  selectedModelId?: string
  onModelChange: (id: string | undefined) => void
}

export const ModelSelector = memo(function ModelSelector({ models, selectedModelId, onModelChange }: ModelSelectorProps) {
  if (!models?.length) return null
  const selected = models.find(({ id }) => id === selectedModelId)
  const providers = models.reduce<Map<string, ModelSelectorModel[]>>((groups, model) => {
    const provider = model.provider ?? 'Other'
    groups.set(provider, [...(groups.get(provider) ?? []), model])
    return groups
  }, new Map())

  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="outline" className="min-h-6 gap-1.5 rounded-lg p-2 pl-3">
        <span className="max-w-[140px] truncate">{selected?.name ?? 'Default'}</span>
        <ChevronDownIcon className="size-4 text-base-600" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="w-[175px] rounded-lg border-base-300 bg-base-250 p-2">
      <DropdownMenuItem onSelect={() => onModelChange(undefined)} className="justify-between rounded-lg px-3 py-2.5">
        <span className="font-medium">Default</span>
        {selectedModelId === undefined ? <CheckIcon className="size-4 text-brand-550" strokeWidth={4} /> : null}
      </DropdownMenuItem>
      {[...providers].map(([provider, providerModels]) => <DropdownMenuSub key={provider}>
        <DropdownMenuSubTrigger className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm outline-none focus:bg-accent data-[state=open]:bg-accent">
          <span className="font-medium">{provider}</span>
          <ChevronRightIcon className="size-4 text-base-600" />
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="z-50 min-w-64 rounded-lg border border-base-300 bg-base-250 p-2 shadow-md">
          {providerModels.map((model) => <DropdownMenuItem key={model.id} onSelect={() => onModelChange(model.id)} className="justify-between rounded-lg px-3 py-2.5">
            <span className="truncate">{model.name}</span>
            {model.id === selectedModelId ? <CheckIcon className="size-4 shrink-0 text-brand-550" strokeWidth={4} /> : null}
          </DropdownMenuItem>)}
        </DropdownMenuSubContent>
      </DropdownMenuSub>)}
    </DropdownMenuContent>
  </DropdownMenu>
})
