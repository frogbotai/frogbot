import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { Composer } from '../../../../packages/ui/src/chat/composer/composer';
import { composerInput, type } from './composerEditor';

const firmwareComposerBaseline = {
  wrapper: 'fb-composer__gradient',
  gradientContainer: 'fb-composer__gradient-container',
  panel: 'fb-composer__panel',
  input: 'fb-composer__input',
  submit: 'fb-composer__action fb-composer__submit',
};

it('matches the canonical Firmware theme foundation', () => {
  const styles = readFileSync(resolve('packages/ui/src/styles.css'), 'utf8');

  expect(styles).toContain('--color-base-0: rgb(249, 250, 251)');
  expect(styles).toContain('--color-base-900: rgb(16, 24, 40)');
  expect(styles).toContain('--color-brand-500: #2f964f');
  expect(styles).toContain(
    '--theme-base-0: light-dark(var(--color-base-0), var(--color-base-1000))',
  );
  expect(styles).toContain(
    '--theme-base-1000: light-dark(var(--color-base-1000), var(--color-base-0))',
  );
  expect(styles).toContain('--fb-radius: 0.5rem');
  expect(styles).not.toContain('Satoshi');
  expect(styles).not.toContain('oklch(');
});

it('matches the canonical Firmware composer shell', () => {
  const { container } = render(
    <Composer onSubmit={vi.fn()} submitContent="Send" stopContent="Stop" />,
  );

  const wrapper = container.querySelector(`.${firmwareComposerBaseline.wrapper}`);
  const gradientContainer = container.querySelector(
    `.${firmwareComposerBaseline.gradientContainer}`,
  );

  const panel = gradientContainer?.firstElementChild;
  const input = composerInput();

  type('Hello');
  const submit = screen.getByRole('button', { name: 'Send' });

  expect(wrapper?.className).toBe(firmwareComposerBaseline.wrapper);
  expect(gradientContainer?.className).toBe(firmwareComposerBaseline.gradientContainer);
  expect(panel?.className).toBe(firmwareComposerBaseline.panel);
  expect(input.className).toBe(firmwareComposerBaseline.input);
  expect(submit.className).toBe(firmwareComposerBaseline.submit);
});
