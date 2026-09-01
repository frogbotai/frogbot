'use client';

import { memo, type ReactNode } from 'react';

import { Button } from '../components/button.js';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItemIndicator,
  DropdownMenuTrigger,
} from '../components/dropdown-menu.js';
import { CheckIcon } from '../icons/check.js';
import ChevronDownIcon from '../icons/icons/ChevronDownIcon.js';
import WrenchIcon from '../icons/icons/WrenchIcon.js';

export type ToolSelectorTool = {
  id: string;
  name: string;
  icon?: ReactNode;
};

export type ToolSelectorProps = {
  tools?: readonly ToolSelectorTool[];
  selected: readonly string[];
  onToolsChange: (ids: string[]) => void;
};

export const ToolSelector = memo(function ToolSelector({
  tools,
  selected,
  onToolsChange,
}: ToolSelectorProps) {
  if (!tools?.length) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="fb-tool-selector__trigger">
          <WrenchIcon className="fb-tool-selector__trigger-icon" />
          <span>Tools</span>
          <ChevronDownIcon className="fb-tool-selector__chevron" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="fb-tool-selector__content">
        {tools.map((tool) => {
          const checked = selected.includes(tool.id);
          return (
            <DropdownMenuCheckboxItem
              key={tool.id}
              checked={checked}
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={() =>
                onToolsChange(
                  checked ? selected.filter((id) => id !== tool.id) : [...selected, tool.id],
                )
              }
              className="fb-tool-selector__item"
            >
              {tool.icon}
              <span className="fb-tool-selector__name">{tool.name}</span>
              <DropdownMenuItemIndicator className="fb-tool-selector__indicator">
                <CheckIcon className="fb-tool-selector__check" strokeWidth={4} />
              </DropdownMenuItemIndicator>
            </DropdownMenuCheckboxItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});
