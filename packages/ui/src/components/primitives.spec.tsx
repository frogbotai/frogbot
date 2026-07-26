import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Button, Card, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../index'

describe('primitives', () => {
  it('renders basic controls and surfaces', () => {
    render(<><Button>Send</Button><Input aria-label="Message" /><Card>Card</Card><Skeleton data-testid="skeleton" /></>)
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Message' })).toBeTruthy()
    expect(screen.getByText('Card')).toBeTruthy()
    expect(screen.getByTestId('skeleton')).toBeTruthy()
  })

  it('exposes every button variant', () => {
    const variants = { default: 'bg-primary', destructive: 'bg-destructive', outline: 'border-border', secondary: 'bg-secondary', ghost: 'hover:bg-accent', link: 'hover:underline' } as const
    for (const variant of Object.keys(variants) as Array<keyof typeof variants>) {
      const { unmount } = render(<Button variant={variant}>{variant}</Button>)
      expect(screen.getByRole('button').className).toContain(variants[variant])
      unmount()
    }
  })

  it('opens tooltips from keyboard focus', async () => {
    const user = userEvent.setup()
    render(<TooltipProvider delayDuration={0}><Tooltip><TooltipTrigger>Help</TooltipTrigger><TooltipContent>Details</TooltipContent></Tooltip></TooltipProvider>)
    await user.tab()
    expect((await screen.findByRole('tooltip')).textContent).toContain('Details')
  })

  it('supports dropdown keyboard focus and Escape', async () => {
    const user = userEvent.setup()
    render(<DropdownMenu><DropdownMenuTrigger>Menu</DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem>First</DropdownMenuItem></DropdownMenuContent></DropdownMenu>)
    await user.click(screen.getByRole('button', { name: 'Menu' }))
    expect(screen.getByRole('menu')).toBeTruthy()
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(screen.getByRole('menuitem'))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Menu' }))
  })

  it('selects an item with the keyboard', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<Select onValueChange={onValueChange}><SelectTrigger aria-label="Choice"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="one">One</SelectItem><SelectItem value="two">Two</SelectItem></SelectContent></Select>)
    screen.getByRole('combobox').focus()
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' })
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onValueChange).toHaveBeenCalled()
  })
})
