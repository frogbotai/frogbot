import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'

import { Composer } from './composer'

const firmwareComposerBaseline = {
  shell: ['gradient-wrapper', 'gradient-container', 'rounded-[20px]', 'border-base-300', 'bg-base-200', 'p-3'],
  textarea: ['gradient-textarea', 'font-payload', 'bg-base-200', 'placeholder:text-base-500', 'max-h-[calc(75dvh)]'],
  submit: ['rounded-full'],
}

it.fails('matches the canonical Firmware composer shell', () => {
  const { container } = render(
    <Composer aria-label="Message" onSubmit={vi.fn()} submitContent="Send" stopContent="Stop" />,
  )

  const form = container.querySelector('form')
  const textarea = screen.getByLabelText('Message')
  const submit = screen.getByRole('button', { name: 'Send' })

  for (const className of firmwareComposerBaseline.shell) expect(form?.classList).toContain(className)
  for (const className of firmwareComposerBaseline.textarea) expect(textarea.classList).toContain(className)
  for (const className of firmwareComposerBaseline.submit) expect(submit.classList).toContain(className)
})
