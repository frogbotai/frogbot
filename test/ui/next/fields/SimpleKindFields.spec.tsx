import { fireEvent, render, screen } from '@testing-library/react';
import type {
  NumberFieldClient,
  NumberFieldClientProps,
  TextFieldClientProps,
  Validate,
} from 'payload';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dispatchField, form, setModified, setValue, TextField, translation, useField } = vi.hoisted(
  () => {
    const form = { formSubmitted: false, value: undefined as unknown };
    const setValue = vi.fn();

    return {
      dispatchField: vi.fn(),
      form,
      setModified: vi.fn(),
      setValue,
      TextField: vi.fn((_props: unknown) => <div data-testid="text-field" />),
      translation: { language: 'en' },
      useField: vi.fn(
        ({ potentiallyStalePath }: { potentiallyStalePath: string; validate?: Validate }) => ({
          customComponents: {},
          disabled: false,
          formSubmitted: form.formSubmitted,
          path: potentiallyStalePath,
          setValue,
          showError: false,
          value: form.value,
        }),
      ),
    };
  },
);

vi.mock('@payloadcms/ui', () => ({
  DefaultCell: () => null,
  FieldDescription: ({ description }: { description?: string }) =>
    description ? <p>{description}</p> : null,
  FieldError: ({ message, showError }: { message?: string; showError?: boolean }) =>
    showError && message ? <p role="alert">{message}</p> : null,
  FieldLabel: ({ as: Tag = 'label', label }: { as?: 'label' | 'span'; label?: string }) => (
    <Tag>{label}</Tag>
  ),
  RenderCustomComponent: ({
    CustomComponent,
    Fallback,
  }: {
    CustomComponent?: ReactNode;
    Fallback: ReactNode;
  }) => CustomComponent ?? Fallback,
  TextField,
  useField,
  useForm: () => ({ setModified }),
  useFormFields: (selector: (context: [unknown, typeof dispatchField]) => unknown) =>
    selector([{}, dispatchField]),
  useTranslation: () => ({ i18n: { language: translation.language } }),
  withCondition: <T,>(Component: T) => Component,
}));

const { DurationField } =
  await import('../../../../packages/next/src/fields/Duration/index.client.js');

const { PercentField } =
  await import('../../../../packages/next/src/fields/Percent/index.client.js');

const { PhoneField } = await import('../../../../packages/next/src/fields/Phone/index.client.js');
const { RatingField } = await import('../../../../packages/next/src/fields/Rating/index.client.js');

function numberField(
  name: string,
  label: string,
  kind: Record<string, unknown>,
): NumberFieldClientProps {
  return {
    field: numberFieldClient({
      name,
      type: 'number',
      label,
      admin: { custom: { frogbot: { kind } } },
    }),
    path: name,
  };
}

// Payload's client `admin` type Picks from an optional type, which makes every picked key
// required; a fixture states only the admin keys it uses.
function numberFieldClient(
  field: Omit<NumberFieldClient, 'admin'> & {
    admin?: Partial<NonNullable<NumberFieldClient['admin']>>;
  },
): NumberFieldClient {
  return field as NumberFieldClient;
}

const percentProps = numberField('progress', 'Progress', { type: 'percent', precision: 1 });

function durationProps(format: 'h:mm' | 'h:mm:ss') {
  return numberField('timeSpent', 'Time spent', { type: 'duration', format });
}

const ratingProps = numberField('score', 'Score', { type: 'rating', max: 5 });

const phoneProps = {
  field: { name: 'phone', type: 'text', label: 'Phone' },
  path: 'phone',
} as TextFieldClientProps;

function input(): HTMLInputElement {
  return screen.getByRole('textbox');
}

function type(text: string) {
  fireEvent.change(input(), { target: { value: text } });
}

function fieldValidate(): Validate {
  return useField.mock.lastCall?.[0].validate as Validate;
}

beforeEach(() => {
  form.formSubmitted = false;
  form.value = undefined;
  translation.language = 'en';
  dispatchField.mockClear();
  setModified.mockClear();
  setValue.mockClear();
  TextField.mockClear();
  useField.mockClear();
});

describe('PercentField', () => {
  it('shows a stored fraction as a percentage', () => {
    form.value = 0.07;

    render(<PercentField {...percentProps} />);

    expect(input().value).toBe('7');
    expect(input().getAttribute('inputmode')).toBe('decimal');
    expect(screen.getByText('%').className).toBe('percent-field__suffix');
  });

  it.each([
    ['7', 0.07],
    ['42.5', 0.425],
  ])('saves %j as %s', (text, value) => {
    render(<PercentField {...percentProps} />);

    type(text);

    expect(setValue).toHaveBeenCalledWith(value);
  });

  it('saves null when cleared', () => {
    form.value = 0.07;

    render(<PercentField {...percentProps} />);

    type('');

    expect(setValue).toHaveBeenCalledWith(null);
  });

  it('holds unreadable text out of the form data', () => {
    render(<PercentField {...percentProps} />);

    type('abc');

    expect(dispatchField).toHaveBeenCalledWith({
      type: 'UPDATE',
      disableFormData: true,
      path: 'progress',
      validate: fieldValidate(),
      value: 'abc',
    });
    expect(setModified).toHaveBeenCalledWith(true);
    expect(setValue).not.toHaveBeenCalled();
  });

  it('rejects held text and accepts a number', () => {
    render(<PercentField {...percentProps} />);

    const validate = fieldValidate();

    expect(validate('abc', {} as Parameters<Validate>[1])).toBe('Enter a percentage such as 42.5.');
    expect(validate(0.42, {} as Parameters<Validate>[1])).toBe(true);
  });

  it('shows the message for held text after a save attempt', () => {
    form.formSubmitted = true;

    const { container } = render(<PercentField {...percentProps} />);

    type('abc');

    expect(screen.getByRole('alert').textContent).toBe('Enter a percentage such as 42.5.');
    expect(container.firstElementChild?.classList.contains('error')).toBe(true);
  });

  it('shows no message for held text while typing', () => {
    render(<PercentField {...percentProps} />);

    type('abc');

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the message for held text on blur without a save attempt', () => {
    const { container } = render(<PercentField {...percentProps} />);

    type('abc');
    fireEvent.blur(input());

    expect(screen.getByRole('alert').textContent).toBe('Enter a percentage such as 42.5.');
    expect(container.firstElementChild?.classList.contains('error')).toBe(true);
    expect(input().value).toBe('abc');
  });

  it('keeps the message while the text stays unreadable and clears it once readable', () => {
    const { container } = render(<PercentField {...percentProps} />);

    type('abc');
    fireEvent.blur(input());
    type('abcd');

    expect(screen.getByRole('alert').textContent).toBe('Enter a percentage such as 42.5.');

    type('42');

    expect(screen.queryByRole('alert')).toBeNull();
    expect(container.firstElementChild?.classList.contains('error')).toBe(false);
  });

  it('shows a read-only value in the reader language', () => {
    form.value = 0.425;
    translation.language = 'de';

    const { container } = render(<PercentField {...percentProps} readOnly />);

    expect(container.querySelector('.percent-field__value')?.textContent).toBe('42,5\u00a0%');
    expect(container.querySelector('input')).toBeNull();
  });

  it('shows nothing for an empty read-only value', () => {
    const { container } = render(<PercentField {...percentProps} readOnly />);

    expect(container.querySelector('.percent-field__value')?.textContent).toBe('');
  });
});

describe('DurationField', () => {
  it.each(['1:30', '90'])('saves %j in h:mm as 5400 seconds', (text) => {
    render(<DurationField {...durationProps('h:mm')} />);

    type(text);

    expect(setValue).toHaveBeenCalledWith(5400);
  });

  it('saves 1:02:03 in h:mm:ss as 3723 seconds', () => {
    render(<DurationField {...durationProps('h:mm:ss')} />);

    type('1:02:03');

    expect(setValue).toHaveBeenCalledWith(3723);
  });

  it.each(['1:75', '1.5'])('holds %j', (text) => {
    render(<DurationField {...durationProps('h:mm:ss')} />);

    type(text);

    expect(dispatchField).toHaveBeenCalledWith(
      expect.objectContaining({ disableFormData: true, path: 'timeSpent', value: text }),
    );
    expect(setValue).not.toHaveBeenCalled();
  });

  it('shows the message for held text on blur and clears it once readable', () => {
    render(<DurationField {...durationProps('h:mm')} />);

    type('1:75');
    fireEvent.blur(input());

    expect(screen.getByRole('alert').textContent).toBe('Enter a duration such as 1:30.');

    type('1:15');

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('clears the blur message when a value arrives from outside the input', () => {
    const props = durationProps('h:mm');
    const { rerender } = render(<DurationField {...props} />);

    type('1:75');
    fireEvent.blur(input());
    form.value = 3600;
    rerender(<DurationField {...props} />);

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('replaces held text with a value from outside the input', () => {
    const props = durationProps('h:mm:ss');
    const { rerender } = render(<DurationField {...props} />);

    type('1:75');
    form.value = 3600;
    rerender(<DurationField {...props} />);

    expect(input().value).toBe('1:00:00');
    expect(setValue).toHaveBeenCalledWith(3600, true);
  });

  it('reformats readable text on blur', () => {
    render(<DurationField {...durationProps('h:mm')} />);

    type('90');
    fireEvent.blur(input());

    expect(input().value).toBe('1:30');
  });

  it('uses the format as the placeholder', () => {
    render(<DurationField {...durationProps('h:mm')} />);

    expect(input().placeholder).toBe('h:mm');
  });

  it.each([
    [5400, '1:30:00'],
    [1.5, '1.5'],
    [undefined, ''],
  ])('shows read-only %s as %j', (value, text) => {
    form.value = value;

    const { container } = render(<DurationField {...durationProps('h:mm:ss')} readOnly />);

    expect(container.querySelector('.duration-field__value')?.textContent).toBe(text);
    expect(container.querySelector('input')).toBeNull();
  });
});

describe('RatingField', () => {
  it('renders a radio group named by the label', () => {
    render(<RatingField {...ratingProps} />);

    const group = screen.getByRole('radiogroup', { name: 'Score' });
    const names = Array.from(group.querySelectorAll('input[type="radio"]'), (radio: Element) =>
      radio.getAttribute('name'),
    );

    expect(screen.getByText('Score').tagName).toBe('SPAN');
    expect(names).toStrictEqual(['score', 'score', 'score', 'score', 'score']);
    expect(screen.getByRole('radio', { name: '1 star' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: '5 stars' })).toBeTruthy();
  });

  it('saves the clicked star', () => {
    render(<RatingField {...ratingProps} />);

    fireEvent.click(screen.getByRole('radio', { name: '4 stars' }));

    expect(setValue).toHaveBeenCalledWith(4);
  });

  it('clears the rating when the checked star is clicked', () => {
    form.value = 3;

    render(<RatingField {...ratingProps} />);

    fireEvent.click(screen.getByRole('radio', { name: '3 stars' }));

    expect(setValue.mock.calls).toStrictEqual([[null]]);
  });

  it('shows read-only stars with no inputs', () => {
    form.value = 3;

    const { container } = render(<RatingField {...ratingProps} readOnly />);

    expect(screen.getByRole('img', { name: '3 of 5' })).toBeTruthy();
    expect(container.querySelector('input')).toBeNull();
  });

  it('shows a read-only value outside the scale as text', () => {
    form.value = 7;

    const { container } = render(<RatingField {...ratingProps} readOnly />);

    expect(container.querySelector('.rating-field__value')?.textContent).toBe('7');
  });
});

describe('PhoneField', () => {
  it('renders the text field when editable', () => {
    render(<PhoneField {...phoneProps} />);

    expect(screen.getByTestId('text-field')).toBeTruthy();
    expect(TextField.mock.lastCall?.[0]).toStrictEqual(phoneProps);
  });

  it.each([
    ['5551234567', '(555) 123-4567'],
    ['+44 20 7946 0958', '+44 20 7946 0958'],
    [null, ''],
  ])('shows read-only %j as %j', (value, text) => {
    form.value = value;

    const { container } = render(<PhoneField {...phoneProps} readOnly />);

    expect(container.querySelector('.phone-field__value')?.textContent).toBe(text);
    expect(container.querySelector('input')).toBeNull();
    expect(TextField).not.toHaveBeenCalled();
  });
});
