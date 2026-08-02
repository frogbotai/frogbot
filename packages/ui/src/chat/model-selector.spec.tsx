import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ModelSelector } from './model-selector'

const models = [
  { id: 'openai/gpt-5', name: 'GPT-5', provider: 'OpenAI' },
  { id: 'anthropic/claude', name: 'Claude', provider: 'Anthropic' },
]

describe('ModelSelector', () => {
  it('renders nothing without caller-supplied models', () => {
    const { container, rerender } = render(<ModelSelector onModelChange={() => undefined} />)
    expect(container.innerHTML).toBe('')
    rerender(<ModelSelector models={[]} onModelChange={() => undefined} />)
    expect(container.innerHTML).toBe('')
  })

  it('shows Default and selects a model from a provider submenu', async () => {
    const onModelChange = vi.fn()
    const user = userEvent.setup()
    render(<ModelSelector models={models} onModelChange={onModelChange} />)
    await user.click(screen.getByRole('button', { name: /Default/ }))
    await user.hover(screen.getByRole('menuitem', { name: /OpenAI/ }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /GPT-5/ }))
    expect(onModelChange).toHaveBeenCalledWith('openai/gpt-5')
  })
})
