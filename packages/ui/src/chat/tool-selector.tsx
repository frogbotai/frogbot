'use client'

import { memo, type ReactNode } from 'react'

import { Button } from '../components/button'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItemIndicator, DropdownMenuTrigger } from '../components/dropdown-menu'
import { CheckIcon } from '../icons/check'
import ChevronDownIcon from '../icons/icons/ChevronDownIcon'
import WrenchIcon from '../icons/icons/WrenchIcon'

export type ToolSelectorTool = {
  id: string
  name: string
  icon?: ReactNode
}

export type ToolSelectorProps = {
  tools?: readonly ToolSelectorTool[]
  selected: readonly string[]
  onToolsChange: (ids: string[]) => void
}

export const ToolSelector = memo(function ToolSelector({ tools, selected, onToolsChange }: ToolSelectorProps) {
  if (!tools?.length) return null

  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="sm" className="gap-1.5 rounded-lg px-2">
        <WrenchIcon className="size-5" />
        <span>Tools</span>
        <ChevronDownIcon className="size-4 text-base-600" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" side="top" className="w-[220px] rounded-lg border-base-300 bg-base-250 p-2">
      {tools.map((tool) => {
        const checked = selected.includes(tool.id)
        return <DropdownMenuCheckboxItem
          key={tool.id}
          checked={checked}
          onSelect={(event) => event.preventDefault()}
          onCheckedChange={() => onToolsChange(checked ? selected.filter((id) => id !== tool.id) : [...selected, tool.id])}
          className="relative flex cursor-default select-none items-center gap-3 rounded-lg px-3 py-2.5 pr-8 text-sm outline-none focus:bg-accent"
        >
          {tool.icon}
          <span className="truncate font-medium">{tool.name}</span>
          <DropdownMenuItemIndicator className="absolute right-3"><CheckIcon className="size-4 text-brand-550" strokeWidth={4} /></DropdownMenuItemIndicator>
        </DropdownMenuCheckboxItem>
      })}
    </DropdownMenuContent>
  </DropdownMenu>
})
