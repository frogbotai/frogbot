'use client';

import { memo } from 'react';

import { Button } from '../components/button.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/dropdown-menu.js';
import { CheckIcon } from '../icons/check.js';
import ChevronDownIcon from '../icons/icons/ChevronDownIcon.js';
import RobotIcon from '../icons/icons/RobotIcon.js';
import { useChatProvider } from './provider.js';

export type AgentSelectorProps = {
  selectedAgent: string;
  onAgentChange: (slug: string) => void;
};

export const AgentSelector = memo(function AgentSelector({
  selectedAgent,
  onAgentChange,
}: AgentSelectorProps) {
  const agents = useChatProvider()?.agentManifest?.agents ?? [];
  const selected = agents.find(({ slug }) => slug === selectedAgent);
  const selectedName = selected?.label ?? selected?.slug ?? selectedAgent;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="fb-agent-selector__trigger">
          <AgentAvatar />
          <span className="fb-agent-selector__trigger-name">{selectedName}</span>
          <ChevronDownIcon className="fb-agent-selector__chevron" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="fb-agent-selector__content">
        {agents.map((agent) => {
          const name = agent.label;
          return (
            <DropdownMenuItem
              key={agent.slug}
              onSelect={() => onAgentChange(agent.slug)}
              className="fb-agent-selector__item"
            >
              <span className="fb-agent-selector__item-agent">
                <AgentAvatar />
                <span className="fb-agent-selector__item-name">{name}</span>
              </span>
              {selectedAgent === agent.slug ? (
                <CheckIcon className="fb-agent-selector__check" strokeWidth={4} />
              ) : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

function AgentAvatar() {
  return <RobotIcon className="fb-agent-selector__avatar" aria-hidden="true" />;
}
