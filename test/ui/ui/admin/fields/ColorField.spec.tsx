import { fireEvent, render, screen } from '@testing-library/react';
import type { TextFieldClient, TextFieldClientProps, Validate } from 'payload';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { form, setValue, useField } = vi.hoisted(() => {
  const form = { disabled: false, value: undefined as unknown };
  const setValue = vi.fn();

  return {
    form,
    setValue,
    useField: vi.fn(
      ({ potentiallyStalePath }: { potentiallyStalePath: string; validate?: Validate }) => ({
        customComponents: {},
        disabled: form.disabled,
        path: potentiallyStalePath,
        setValue,
        showError: false,
        value: form.value,
      }),
    ),
  };
});

vi.mock('@payloadcms/ui', () => ({
  DefaultCell: () => null,
  FieldDescription: () => null,
  FieldError: () => null,
  FieldLabel: ({ label }: { label?: string }) => <label>{label}</label>,
  RenderCustomComponent: ({
    CustomComponent,
    Fallback,
  }: {
    CustomComponent?: ReactNode;
    Fallback: ReactNode;
  }) => CustomComponent ?? Fallback,
  useField,
  useTranslation: () => ({ i18n: { language: 'en' } }),
  withCondition: <T,>(Component: T) => Component,
}));

const { ColorField } =
  await import('../../../../../packages/ui/src/admin/fields/Color/index.client.js');

function colorProps(
  swatches: string[] = ['#ef4444', '#3b82f6'],
  admin: Partial<NonNullable<TextFieldClient['admin']>> = {},
): TextFieldClientProps {
  return {
    field: {
      name: 'color',
      type: 'text',
      label: 'Color',
      admin: { ...admin, custom: { frogbot: { kind: { type: 'color', swatches } } } },
    },
    path: 'color',
  };
}

function textInput(container: HTMLElement) {
  return container.querySelector<HTMLInputElement>('input[type="text"]');
}

function picker() {
  return screen.getByLabelText<HTMLInputElement>('Pick a color for Color');
}

describe('ColorField', () => {
  beforeEach(() => {
    form.disabled = false;
    form.value = undefined;
    setValue.mockClear();
  });

  it('puts the text input first, so a list cell focuses and types into it', () => {
    const { container } = render(<ColorField {...colorProps()} />);

    expect(container.querySelector('input')).toBe(textInput(container));
    expect(textInput(container)?.name).toBe('color');
  });

  it('saves typed text as typed', () => {
    const { container } = render(<ColorField {...colorProps()} />);

    fireEvent.change(textInput(container)!, { target: { value: '#ABC' } });

    expect(setValue).toHaveBeenCalledWith('#ABC');
  });

  it('opens the picker on the stored color at full length', () => {
    form.value = '#F0A';

    render(<ColorField {...colorProps()} />);

    expect(picker().type).toBe('color');
    expect(picker().value).toBe('#ff00aa');
  });

  it('opens the picker on black when the value is not a color', () => {
    form.value = 'blue';

    const { container } = render(<ColorField {...colorProps()} />);

    expect(picker().value).toBe('#000000');
    expect(container.querySelector('.color-field__picker .color-swatch--empty')).not.toBeNull();
  });

  it('saves the color picked', () => {
    render(<ColorField {...colorProps()} />);

    fireEvent.change(picker(), { target: { value: '#123456' } });

    expect(setValue).toHaveBeenCalledWith('#123456');
  });

  it('saves a clicked swatch and marks the current one pressed', () => {
    form.value = '#3B82F6';

    render(<ColorField {...colorProps()} />);

    const group = screen.getByRole('group', { name: 'Color swatches' });
    const red = screen.getByRole('button', { name: '#ef4444' });

    expect(group.querySelectorAll('button')).toHaveLength(2);
    expect(screen.getByRole('button', { name: '#3b82f6' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(red.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(red);

    expect(setValue).toHaveBeenCalledWith('#ef4444');
  });

  it('shows no swatch group for an empty list', () => {
    render(<ColorField {...colorProps([])} />);

    expect(screen.queryByRole('group')).toBeNull();
  });

  it('uses the configured placeholder', () => {
    const { container } = render(<ColorField {...colorProps([], { placeholder: '#000' })} />);

    expect(textInput(container)?.placeholder).toBe('#000');
  });

  it('disables every control while the form is disabled', () => {
    form.disabled = true;

    const { container } = render(<ColorField {...colorProps()} />);

    expect(container.querySelectorAll('input:not(:disabled), button:not(:disabled)')).toHaveLength(
      0,
    );
  });

  it('shows a read-only value as a swatch and text, with no controls', () => {
    form.value = '#3b82f6';

    const { container } = render(<ColorField {...colorProps()} readOnly />);

    const swatch = container.querySelector<HTMLElement>('.color-field__value .color-swatch');

    expect(container.querySelector('.color-field__value')?.textContent).toBe('#3b82f6');
    expect(swatch?.style.backgroundColor).toBe('rgb(59, 130, 246)');
    expect(container.querySelector('input, button')).toBeNull();
  });

  it('shows the read-only view when the field config is read-only', () => {
    form.value = '#fff';

    const { container } = render(<ColorField {...colorProps([], { readOnly: true })} />);

    expect(container.querySelector('.color-field.read-only')).not.toBeNull();
    expect(container.querySelector('input')).toBeNull();
  });
});
