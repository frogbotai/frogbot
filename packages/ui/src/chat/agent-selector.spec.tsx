import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ChatProvider } from './provider'
import { AgentSelector } from './agent-selector'

const manifest = {
  ai: { transcribe: false as const },
  chat: { enabled: true, threadsSlug: 'threads', messagesSlug: 'messages' },
  files: { slug: 'files' },
  agents: [
    { slug: 'support', profile: { name: 'Ada', avatar: '/ada.png' } },
    { slug: 'sales' },
  ],
}

describe('AgentSelector', () => {
  it('selects manifest agents and marks the current agent', async () => {
    const onAgentChange = vi.fn()
    const user = userEvent.setup()
    const adapter = { fetch: vi.fn().mockResolvedValue(Response.json(manifest)) }
    render(<ChatProvider adapter={adapter}><AgentSelector selectedAgent="support" onAgentChange={onAgentChange} /></ChatProvider>)
    await waitFor(() => expect(screen.getByRole('button', { name: /Ada/ })).toBeTruthy())
    await user.click(screen.getByRole('button', { name: /Ada/ }))
    expect(screen.getByRole('img', { name: 'Ada' }).getAttribute('src')).toBe('/ada.png')
    expect(screen.getByRole('menuitem', { name: /Ada/ }).querySelector('svg')).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitem', { name: /sales/ }))
    expect(onAgentChange).toHaveBeenCalledWith('sales')
  })

  it('renders the agent fallback without an avatar', async () => {
    const adapter = { fetch: vi.fn().mockResolvedValue(Response.json(manifest)) }
    render(<ChatProvider adapter={adapter}><AgentSelector selectedAgent="sales" onAgentChange={() => undefined} /></ChatProvider>)
    await waitFor(() => expect(screen.getByRole('button', { name: /sales/ })).toBeTruthy())
    expect(screen.getByRole('button', { name: /sales/ }).querySelector('svg')).toBeTruthy()
  })
})
