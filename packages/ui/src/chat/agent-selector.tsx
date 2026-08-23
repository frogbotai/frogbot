'use client';

import { memo } from 'react';

import { Button } from '../components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/dropdown-menu';
import { CheckIcon } from '../icons/check';
import ChevronDownIcon from '../icons/icons/ChevronDownIcon';
import RobotIcon from '../icons/icons/RobotIcon';
import { useChatProvider } from './provider';

export type AgentSelectorProps = {
  selectedAgent: string;
  onAgentChange: (slug: string) => void;
};

export const AgentSelector = memo(function AgentSelector({
  selectedAgent,
  onAgentChange,
}: AgentSelectorProps) {
  const agents = useChatProvider()?.manifest?.agents ?? [];
  const selected = agents.find(({ slug }) => slug === selectedAgent);
  const selectedName = selected?.profile?.name ?? selected?.slug ?? selectedAgent;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="fb-agent-selector__trigger">
          <AgentAvatar agent={selected} name={selectedName} />
          <span className="fb-agent-selector__trigger-name">{selectedName}</span>
          <ChevronDownIcon className="fb-agent-selector__chevron" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="fb-agent-selector__content"
      >
        {agents.map((agent) => {
          const name = agent.profile?.name ?? agent.slug;
          return (
            <DropdownMenuItem
              key={agent.slug}
              onSelect={() => onAgentChange(agent.slug)}
              className="fb-agent-selector__item"
            >
              <span className="fb-agent-selector__item-agent">
                <AgentAvatar agent={agent} name={name} />
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

function AgentAvatar({ agent, name }: { agent?: { profile?: { avatar?: string } }; name: string }) {
  if (agent?.profile?.avatar) {
    return (
      <img src={agent.profile.avatar} alt={name} className="fb-agent-selector__avatar" />
    );
  }
  return <RobotIcon className="fb-agent-selector__avatar" aria-hidden="true" />;
}
