import type * as Admin from '@frogbotai/ui/admin';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { FormState } from 'payload';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FormFieldInfo } from '../../../packages/plugins/plugin-forms/src/definition.js';

const form = vi.hoisted(() => ({
  state: {} as FormState,
  addFieldRow: vi.fn(),
  moveFieldRow: vi.fn(),
  removeFieldRow: vi.fn(),
}));

vi.mock('@frogbotai/ui/admin', async (importActual) => {
  const actual = await importActual<typeof Admin>();

  return {
    DraggableSortable: actual.DraggableSortable,
    DraggableSortableItem: actual.DraggableSortableItem,
    RenderFields: ({
      fields,
      parentPath,
    }: {
      fields: { name: string; admin?: { placeholder?: string } }[];
      parentPath: string;
    }) => (
      <div data-testid={`fields-${parentPath}`}>
        {fields.map(({ name, admin }) => (
          <input aria-label={name} key={name} placeholder={admin?.placeholder} readOnly />
        ))}
      </div>
    ),
    useAllFormFields: () => [form.state, vi.fn()],
    useForm: () => ({
      addFieldRow: form.addFieldRow,
      moveFieldRow: form.moveFieldRow,
      removeFieldRow: form.removeFieldRow,
    }),
  };
});

const { FormBuilder } =
  await import('../../../packages/plugins/plugin-forms/src/builder/FormBuilder.js');

const leads: FormFieldInfo[] = [
  { name: 'email', label: 'Email', type: 'email', required: true, hasDefault: false },
  {
    name: 'firstName',
    label: 'First Name',
    type: 'text',
    required: false,
    hasDefault: false,
    description: 'As on your ID',
  },
  { name: 'interest', label: 'Interest', type: 'select', required: false, hasDefault: false },
  { name: 'priority', label: 'Priority', type: 'select', required: true, hasDefault: true },
  {
    name: 'internalNote',
    label: 'Internal Note',
    type: 'text',
    required: false,
    hasDefault: false,
    createRefusal: "can't be filled from a form: its create access denies form submissions",
  },
  {
    name: 'meta',
    label: 'Meta',
    type: 'json',
    required: false,
    hasDefault: false,
    refusal: "has type json, which forms can't ask for",
  },
];

const stepsField = {
  fields: [
    { name: 'title', type: 'text' },
    {
      name: 'questions',
      type: 'array',
      fields: [
        { name: 'field', type: 'text' },
        { name: 'label', type: 'text' },
        { name: 'description', type: 'textarea' },
        { name: 'placeholder', type: 'text' },
      ],
    },
  ],
} as never;

function setState(steps: string[][], extra: FormState = {}) {
  const state: FormState = {
    collection: { value: 'leads' },
    mode: { value: 'create' },
    steps: { rows: steps.map((_, index) => ({ id: `s${index}` })), value: steps.length },
    ...extra,
  };

  steps.forEach((questions, stepIndex) => {
    state[`steps.${stepIndex}.questions`] = {
      rows: questions.map((name) => ({ id: `q-${name}` })),
      value: questions.length,
    };

    questions.forEach((name, index) => {
      const row = `steps.${stepIndex}.questions.${index}`;
      state[`${row}.id`] = { value: `q-${name}` };
      state[`${row}.field`] = { value: name, valid: true };
    });
  });

  form.state = state;
}

function renderBuilder() {
  return render(<FormBuilder field={stepsField} fields={{ leads }} path="steps" />);
}

function openPicker(index = 0) {
  fireEvent.click(screen.getAllByRole('button', { name: 'Add question' })[index]);
}

describe('FormBuilder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists usable fields with type and required mark, greys refused ones and hides used ones', () => {
    setState([['firstName']]);
    renderBuilder();
    openPicker();

    const choices = screen
      .getAllByRole('listitem')
      .filter(
        (item) =>
          item.classList.contains('fb-form-builder__choice') || item.querySelector('button'),
      );

    const usable = screen
      .getAllByRole('button')
      .filter((button) => button.classList.contains('fb-form-builder__choice'));

    expect(usable.map((button) => button.textContent)).toEqual([
      'EmailemailRequired',
      'Interestselect',
      'PriorityselectRequired',
    ]);

    const refused = choices.filter((item) =>
      item.classList.contains('fb-form-builder__choice--refused'),
    );

    expect(refused.map((item) => item.textContent)).toEqual([
      "Internal NotetextInternal Note can't be filled from a form: its create access denies form submissions.",
      "MetajsonMeta has type json, which forms can't ask for.",
    ]);

    expect(screen.queryByRole('button', { name: /^First Name/ })).toBeNull();
  });

  it('adds a picked field as a question of that step', () => {
    setState([['email']]);
    renderBuilder();
    openPicker();
    fireEvent.click(screen.getByRole('button', { name: /^Interest/ }));

    expect(form.addFieldRow).toHaveBeenCalledWith({
      path: 'steps.0.questions',
      rowIndex: 1,
      schemaPath: 'steps.questions',
      subFieldState: {
        field: { initialValue: 'interest', isModified: true, valid: true, value: 'interest' },
      },
    });
  });

  it('starts the first step when a new form adds its first question', () => {
    setState([]);
    renderBuilder();
    openPicker();
    fireEvent.click(screen.getByRole('button', { name: /^Email/ }));

    expect(form.addFieldRow.mock.calls.map(([args]) => [args.path, args.rowIndex])).toEqual([
      ['steps', 0],
      ['steps.0.questions', 0],
    ]);
  });

  it('warns about a required field with no default that is not on the form', () => {
    setState([['firstName']]);
    renderBuilder();

    expect(screen.getByRole('alert').textContent).toBe(
      'Saving will be refused: add Email or give it a default in config.',
    );
  });

  it('does not warn an editing form about required fields', () => {
    setState([['firstName']], { mode: { value: 'update' } });
    renderBuilder();

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says to add a field in config when none can be a question', () => {
    setState([[]]);

    render(
      <FormBuilder
        field={stepsField}
        fields={{ leads: leads.filter(({ name }) => name === 'meta') }}
        path="steps"
      />,
    );

    openPicker();

    expect(
      screen.getByText('No field of leads can be a question. Add one in config.'),
    ).toBeTruthy();
  });

  it('shows each question with its label, type, required mark and help text', () => {
    setState([['email', 'firstName']], {
      'steps.0.questions.0.label': { value: 'Work email' },
    });

    renderBuilder();

    const rows = screen.getAllByRole('listitem');

    expect(
      rows.map((row) => row.querySelector('.fb-form-builder__question-summary')?.textContent),
    ).toEqual(['Work emailemailRequired', 'First NametextAs on your ID']);
  });

  it('opens the wording inputs with the config values as placeholders', () => {
    setState([['firstName']]);
    renderBuilder();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const inputs = within(screen.getByTestId('fields-steps.0.questions.0'));

    expect(inputs.getByLabelText('label').getAttribute('placeholder')).toBe('First Name');
    expect(inputs.getByLabelText('description').getAttribute('placeholder')).toBe('As on your ID');
    expect(inputs.getByLabelText('placeholder').getAttribute('placeholder')).toBeNull();
  });

  it('removes a question from the form only', () => {
    setState([['email', 'firstName']]);
    renderBuilder();
    fireEvent.click(screen.getByRole('button', { name: 'Remove First Name' }));

    expect(form.removeFieldRow).toHaveBeenCalledWith({ path: 'steps.0.questions', rowIndex: 1 });
  });

  it('shows no step chrome for one step', () => {
    setState([['email']]);
    renderBuilder();

    expect(screen.queryByRole('region')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove step' })).toBeNull();
  });

  it('adds a step, and removes an empty one without asking', () => {
    setState([['email'], []]);
    renderBuilder();

    expect(screen.getAllByRole('region').map((step) => step.getAttribute('aria-label'))).toEqual([
      'Step 1',
      'Step 2',
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Add step' }));

    expect(form.addFieldRow).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'steps', rowIndex: 2 }),
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove step' })[1]);

    expect(form.removeFieldRow).toHaveBeenCalledWith({ path: 'steps', rowIndex: 1 });
  });

  it('asks before removing a step with questions', () => {
    setState([['email'], ['firstName', 'interest']]);
    renderBuilder();
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove step' })[1]);

    expect(form.removeFieldRow).not.toHaveBeenCalled();

    const dialog = screen.getByRole('dialog');

    expect(dialog.textContent).toContain(
      'Its 2 questions leave the form. Records keep their answers.',
    );

    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove step' }));

    expect(form.removeFieldRow).toHaveBeenCalledWith({ path: 'steps', rowIndex: 1 });
  });

  it('moves a question into the next step with Space, ArrowDown, Space', async () => {
    setState([['email', 'firstName'], ['interest']]);

    const order = () => [
      ...document.querySelectorAll('.fb-form-builder__step-header, .fb-form-builder__question'),
    ];

    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      const index = order().indexOf(this);
      const top = index < 0 ? 0 : index * 40;
      const height = index < 0 ? 400 : 40;

      return {
        x: 0,
        y: top,
        top,
        left: 0,
        width: 300,
        height,
        right: 300,
        bottom: top + height,
        toJSON: () => ({}),
      };
    });

    renderBuilder();

    const handle = screen.getByRole('button', { name: 'Move First Name' });

    const row = handle.closest('li');

    handle.focus();
    fireEvent.keyDown(handle, { code: 'Space', key: ' ' });

    await waitFor(() => {
      fireEvent.keyDown(handle, { code: 'ArrowDown', key: 'ArrowDown' });

      expect(row?.style.transform).toMatch(/translate3d\(0px, [1-9]/);
    });

    fireEvent.keyDown(handle, { code: 'Space', key: ' ' });

    expect(form.addFieldRow).toHaveBeenCalledWith({
      path: 'steps.1.questions',
      rowIndex: 0,
      schemaPath: 'steps.questions',
      subFieldState: { id: { value: 'q-firstName' }, field: { value: 'firstName', valid: true } },
    });

    expect(form.removeFieldRow).toHaveBeenCalledWith({ path: 'steps.0.questions', rowIndex: 1 });
  });
});
