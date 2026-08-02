'use client'

import { memo } from 'react'

import { Button } from '../components/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/dropdown-menu'
import RobotIcon from '../icons/icons/RobotIcon'
import { CheckIcon } from '../icons/check'
import ChevronDownIcon from '../icons/icons/ChevronDownIcon'
import { useChatProvider } from './provider'

export type AgentSelectorProps = {
  selectedAgent: string
  onAgentChange: (slug: string) => void
}

export const AgentSelector = memo(function AgentSelector({ selectedAgent, onAgentChange }: AgentSelectorProps) {
  const agents = useChatProvider()?.manifest?.agents ?? []
  const selected = agents.find(({ slug }) => slug === selectedAgent)
  const selectedName = selected?.profile?.name ?? selected?.slug ?? selectedAgent

  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="outline" className="min-h-6 gap-1.5 rounded-lg p-2 pl-3">
        <AgentAvatar agent={selected} name={selectedName} />
        <span className="max-w-[120px] truncate">{selectedName}</span>
        <ChevronDownIcon className="size-4 text-base-600" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="w-[200px] rounded-lg border-base-300 bg-base-250 p-2">
      {agents.map((agent) => {
        const name = agent.profile?.name ?? agent.slug
        return <DropdownMenuItem key={agent.slug} onSelect={() => onAgentChange(agent.slug)} className="justify-between rounded-lg px-3 py-2.5">
          <span className="flex min-w-0 items-center gap-3">
            <AgentAvatar agent={agent} name={name} />
            <span className="truncate font-medium">{name}</span>
          </span>
          {selectedAgent === agent.slug ? <CheckIcon className="size-4 shrink-0 text-brand-550" strokeWidth={4} /> : null}
        </DropdownMenuItem>
      })}
    </DropdownMenuContent>
  </DropdownMenu>
})

function AgentAvatar({ agent, name }: { agent?: { profile?: { avatar?: string } }; name: string }) {
  if (agent?.profile?.avatar) return <img src={agent.profile.avatar} alt={name} className="size-5 rounded-full object-cover" />
  return <RobotIcon className="size-5" aria-hidden="true" />
}
