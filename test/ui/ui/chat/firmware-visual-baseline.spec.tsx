import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { Composer } from '../../../../packages/ui/src/chat/composer/composer';
import { composerInput, type } from './composerEditor';

const firmwareComposerBaseline = {
  wrapper: 'fb-composer__gradient fb-glow',
  gradientContainer: 'fb-composer__gradient-container fb-glow__ring',
  panel: 'fb-composer__panel',
  input: 'fb-composer__input',
  submit: 'fb-composer__action fb-composer__submit',
};

it("matches the canonical theme foundation on Payload's color tokens", () => {
  const styles = readFileSync(resolve('packages/ui/src/styles.css'), 'utf8');
  const tokens = readFileSync(resolve('packages/ui/src/payload-tokens.css'), 'utf8');

  expect(styles).toContain('@import "./payload-tokens.css";');
  expect(tokens).toContain('--color-bg: var(--ramp-white-1000)');
  expect(tokens).toContain('--color-bg: var(--ramp-grey-800)');
  expect(tokens).toContain('--color-bg-brand: var(--ramp-blue-500)');
  expect(styles).toContain('--fb-radius: 0.5rem');

  for (const css of [styles, tokens]) {
    expect(css).not.toContain('Satoshi');
    expect(css).not.toContain('oklch(');
    expect(css).not.toContain('light-dark(');
  }
});

it('matches the canonical Firmware composer shell', () => {
  const { container } = render(
    <Composer onSubmit={vi.fn()} submitContent="Send" stopContent="Stop" />,
  );

  const wrapper = container.querySelector('.fb-composer__gradient');
  const gradientContainer = container.querySelector('.fb-composer__gradient-container');

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
