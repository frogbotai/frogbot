import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import {
  Checkbox,
  RadioGroup,
  RadioGroupItem,
  ScrollArea,
  ScrollBar,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '../../../../packages/ui/src/index';

const stray = { asChild: true } as object;

it('SelectContent ignores asChild and renders its listbox', () => {
  render(
    <Select open>
      <SelectTrigger aria-label="Choice">
        <SelectValue />
      </SelectTrigger>
      <SelectContent {...stray}>
        <SelectItem value="one">One</SelectItem>
      </SelectContent>
    </Select>,
  );

  const content = screen.getByRole('listbox');

  expect(content.tagName).toBe('DIV');
  expect(content.className).toContain('fb-select__content');
  expect(content.querySelector('.fb-select__viewport')).not.toBeNull();
});

it('SelectItem ignores asChild and renders its option', () => {
  render(
    <Select open>
      <SelectTrigger aria-label="Choice">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="one" {...stray}>
          <a href="/one">One</a>
        </SelectItem>
      </SelectContent>
    </Select>,
  );

  const option = screen.getByRole('option', { name: 'One' });

  expect(option.tagName).toBe('DIV');
  expect(option.className).toContain('fb-select__item');
  expect(option.querySelector('a')).not.toBeNull();
});

it('ScrollArea ignores asChild and renders its viewport', () => {
  const { container } = render(
    <ScrollArea {...stray}>
      <p>Content</p>
    </ScrollArea>,
  );

  const root = container.firstElementChild!;

  expect(root.tagName).toBe('DIV');
  expect(root.className).toBe('fb-scroll-area');
  expect(root.querySelector('.fb-scroll-area__viewport p')?.textContent).toBe('Content');
});

it('ScrollBar ignores asChild and renders its scrollbar', () => {
  const { container } = render(
    <ScrollArea type="always">
      <ScrollBar orientation="horizontal" {...stray} />
    </ScrollArea>,
  );

  const scrollbar = container.querySelector('.fb-scroll-area__scrollbar--horizontal');

  expect(scrollbar?.tagName).toBe('DIV');
  expect(scrollbar?.getAttribute('data-orientation')).toBe('horizontal');
});

it('Checkbox ignores asChild and renders its button', () => {
  render(<Checkbox aria-label="Accept" defaultChecked {...stray} />);

  const checkbox = screen.getByRole('checkbox', { name: 'Accept' });

  expect(checkbox.tagName).toBe('BUTTON');
  expect(checkbox.className).toBe('fb-checkbox fb-checkbox--primary');
  expect(checkbox.querySelector('.fb-checkbox__indicator svg')).not.toBeNull();
});

it('Checkbox ignores asChild while unchecked and still renders its button', () => {
  render(<Checkbox aria-label="Accept" {...stray} />);

  const checkbox = screen.getByRole('checkbox', { name: 'Accept' });

  expect(checkbox.tagName).toBe('BUTTON');
  expect(checkbox.getAttribute('aria-checked')).toBe('false');
});

it('RadioGroupItem ignores asChild and renders its button', () => {
  render(
    <RadioGroup defaultValue="one">
      <RadioGroupItem aria-label="One" value="one" {...stray} />
    </RadioGroup>,
  );

  const radio = screen.getByRole('radio', { name: 'One' });

  expect(radio.tagName).toBe('BUTTON');
  expect(radio.className).toBe('fb-radio-group__item');
  expect(radio.querySelector('.fb-radio-group__indicator')).not.toBeNull();
});

it('Switch ignores asChild and renders its button', () => {
  render(<Switch aria-label="Enabled" {...stray} />);

  const toggle = screen.getByRole('switch', { name: 'Enabled' });

  expect(toggle.tagName).toBe('BUTTON');
  expect(toggle.className).toContain('fb-switch');
  expect(toggle.querySelector('.fb-switch__thumb')).not.toBeNull();
});
