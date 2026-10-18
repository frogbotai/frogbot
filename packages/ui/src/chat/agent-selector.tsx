'use client';

import { memo } from 'react';

import { ComposerSelect } from './composer-select.js';
import { useChatProvider } from './provider.js';

export type AgentSelectorProps = {
  selectedAgent: string;
  onAgentChange: (slug: string) => void;
};

export const AgentSelector = memo(function AgentSelector({
  selectedAgent,
  onAgentChange,
}: AgentSelectorProps) {
  const agents = useChatProvider()?.manifest?.agents ?? [];

  return (
    <ComposerSelect
      className="fb-agent-selector"
      value={selectedAgent}
      options={agents.map((agent) => ({
        value: agent.slug,
        label: agent.label,
        icon: 'robot',
      }))}
      onChange={onAgentChange}
    />
  );
});
