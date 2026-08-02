import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'

import { Composer } from './composer'

const firmwareComposerBaseline = {
  shell: ['gradient-wrapper', 'gradient-container', 'rounded-[20px]', 'border-base-300', 'bg-base-200', 'p-3'],
  textarea: ['gradient-textarea', 'font-payload', 'bg-base-200', 'placeholder:text-base-500', 'max-h-[calc(75dvh)]'],
  submit: ['rounded-full'],
}

it('matches the canonical Firmware theme foundation', () => {
  const styles = readFileSync(resolve('packages/ui/src/styles.css'), 'utf8')

  expect(styles).toContain('--color-base-0: rgb(249, 250, 251)')
  expect(styles).toContain('--color-base-900: rgb(16, 24, 40)')
  expect(styles).toContain('--color-brand-500: #2f964f')
  expect(styles).toContain('--theme-base-0: var(--color-base-1000)')
  expect(styles).toContain('--theme-base-1000: var(--color-base-0)')
  expect(styles).toContain('--radius: 0.5rem')
  expect(styles).toContain('"Satoshi-Variable"')
  expect(styles).not.toContain('oklch(')
})

it('matches the canonical Firmware composer shell', () => {
  const { container } = render(
    <Composer aria-label="Message" onSubmit={vi.fn()} submitContent="Send" stopContent="Stop" />,
  )

  const wrapper = container.querySelector('.gradient-wrapper')
  const gradientContainer = container.querySelector('.gradient-container')
  const panel = gradientContainer?.firstElementChild
  const textarea = screen.getByLabelText('Message')
  fireEvent.change(textarea, { target: { value: 'Hello' } })
  const submit = screen.getByRole('button', { name: 'Send' })

  expect(wrapper?.classList).toContain(firmwareComposerBaseline.shell[0])
  expect(gradientContainer?.classList).toContain(firmwareComposerBaseline.shell[1])
  for (const className of firmwareComposerBaseline.shell.slice(2)) expect(panel?.classList).toContain(className)
  for (const className of firmwareComposerBaseline.textarea) expect(textarea.classList).toContain(className)
  for (const className of firmwareComposerBaseline.submit) expect(submit.classList).toContain(className)
})
