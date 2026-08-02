import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ToolSelector } from './tool-selector'

const tools = [{ id: 'search', name: 'Search' }, { id: 'files', name: 'Files' }]

describe('ToolSelector', () => {
  it('renders nothing without caller-supplied tools', () => {
    const { container, rerender } = render(<ToolSelector selected={[]} onToolsChange={() => undefined} />)
    expect(container.innerHTML).toBe('')
    rerender(<ToolSelector tools={[]} selected={[]} onToolsChange={() => undefined} />)
    expect(container.innerHTML).toBe('')
  })

  it('adds and removes tools without closing the menu', async () => {
    const onToolsChange = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(<ToolSelector tools={tools} selected={['search']} onToolsChange={onToolsChange} />)
    await user.click(screen.getByRole('button', { name: /Tools/ }))
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Files' }))
    expect(onToolsChange).toHaveBeenLastCalledWith(['search', 'files'])
    expect(screen.getByRole('menuitemcheckbox', { name: 'Search' })).toBeTruthy()
    rerender(<ToolSelector tools={tools} selected={['search', 'files']} onToolsChange={onToolsChange} />)
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Search' }))
    expect(onToolsChange).toHaveBeenLastCalledWith(['files'])
  })
})
