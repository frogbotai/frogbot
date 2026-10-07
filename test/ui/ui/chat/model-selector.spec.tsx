import { readFileSync } from 'node:fs';

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  ModelSelector,
  type ModelSelectorModel,
} from '../../../../packages/ui/src/chat/model-selector';
import { providerLogos } from '../../../../packages/ui/src/chat/provider-logos';
import { sparkleIcon } from '../../../../packages/ui/src/icons/icons/SparkleIcon';

const gpt: ModelSelectorModel = {
  id: 'openai/gpt-5',
  name: 'GPT-5',
  provider: 'OpenAI',
  reasoning: [
    { key: 'minimal', label: 'Minimal' },
    { key: 'low', label: 'Low' },
    { key: 'medium', label: 'Medium' },
    { key: 'high', label: 'High' },
  ],
};

const mini: ModelSelectorModel = {
  id: 'openai/gpt-5-mini',
  name: 'GPT-5 mini',
  provider: 'OpenAI',
  reasoning: [{ key: 'high', label: 'High' }],
};

const plain: ModelSelectorModel = { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'OpenAI' };

const opus: ModelSelectorModel = {
  id: 'anthropic/claude-opus',
  name: 'Claude Opus',
  provider: 'Anthropic',
  reasoning: [
    { key: 'high', label: 'High · 16k' },
    { key: 'max', label: 'Max · 32k' },
  ],
};

const models = [gpt, mini, plain, opus];

function Harness({
  choices = models,
  initialModel = gpt.id,
  initialReasoning,
  onModelChange,
  onReasoningChange,
}: {
  choices?: readonly ModelSelectorModel[];
  initialModel?: string;
  initialReasoning?: string;
  onModelChange?: (id: string) => void;
  onReasoningChange?: (key: string | undefined) => void;
}) {
  const [model, setModel] = useState(initialModel);
  const [reasoning, setReasoning] = useState(initialReasoning);

  return (
    <ModelSelector
      models={choices}
      selectedModelId={model}
      selectedReasoning={reasoning}
      onModelChange={(id) => {
        onModelChange?.(id);
        setModel(id);
        setReasoning(undefined);
      }}
      onReasoningChange={(key) => {
        onReasoningChange?.(key);
        setReasoning(key);
      }}
    />
  );
}

function trigger() {
  return screen.getByRole('button', { expanded: false });
}

function openTrigger() {
  return screen.getByRole('button', { expanded: true });
}

function stopLabels() {
  const slider = screen.getByRole<HTMLInputElement>('slider', { name: 'Reasoning' });
  const initial = slider.value;

  const labels = Array.from({ length: Number(slider.max) + 1 }, (_, index) => {
    fireEvent.change(slider, { target: { value: String(index) } });

    return slider.getAttribute('aria-valuetext');
  });

  fireEvent.change(slider, { target: { value: initial } });

  return labels;
}

async function openList(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('button', { name: `${name}, change model` }));
}

function searchBox() {
  return screen.getByRole<HTMLInputElement>('textbox', { name: 'Search models' });
}

function row(name: string) {
  return screen.getByRole('button', { name });
}

function rowNames() {
  return [...document.querySelectorAll('.fb-model-selector__option-name')].map(
    (option) => option.textContent,
  );
}

describe('ModelSelector', () => {
  it('always shows a non-autofocused search field even for two models', async () => {
    const user = userEvent.setup();

    render(<Harness choices={[gpt, mini]} />);

    await user.click(trigger());
    await openList(user, 'GPT-5');

    const input = screen.getByRole('textbox', { name: 'Search models' });

    expect(input.getAttribute('placeholder')).toBe('Search models');
    expect(input.getAttribute('autocomplete')).toBe('off');
    expect(input.getAttribute('spellcheck')).toBe('false');
    expect(input.closest('.fb-search-input')?.querySelector('.fb-search-input__icon')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'GPT-5' }));
  });

  it.each([
    ['opus', ['Claude Opus']],
    ['openai/gpt-5-mini', ['GPT-5 mini']],
    ['anthropic', ['Claude Opus']],
  ])('filters models by name, full ID or provider for query %s', async (query, names) => {
    const user = userEvent.setup();

    render(<Harness />);

    await user.click(trigger());
    await openList(user, 'GPT-5');
    await user.type(screen.getByRole('textbox', { name: 'Search models' }), query);

    expect(
      [...document.querySelectorAll('.fb-model-selector__option-name')].map(
        (row) => row.textContent,
      ),
    ).toEqual(names);
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Search models' }));
  });

  it('hides empty provider groups while keeping matching headings text-only', async () => {
    const user = userEvent.setup();

    render(<Harness />);

    await user.click(trigger());
    await openList(user, 'GPT-5');
    await user.type(screen.getByRole('textbox', { name: 'Search models' }), 'opus');

    expect(screen.queryByRole('group', { name: 'OpenAI' })).toBeNull();
    expect(
      screen
        .getByRole('group', { name: 'Anthropic' })
        .querySelectorAll('.fb-model-selector__option'),
    ).toHaveLength(1);
  });

  it('shows an empty state and clears back to the full list with the selected model unchanged', async () => {
    const user = userEvent.setup();
    const onModelChange = vi.fn();

    render(<Harness onModelChange={onModelChange} />);

    await user.click(trigger());
    await openList(user, 'GPT-5');
    await user.type(screen.getByRole('textbox', { name: 'Search models' }), 'unknown');

    expect(document.querySelector('.fb-model-selector__empty')?.textContent).toBe(
      'No models found',
    );
    expect(document.querySelectorAll('.fb-model-selector__option')).toHaveLength(0);
    expect(screen.queryByRole('group')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Clear' }));

    const selected = screen.getByRole('button', { name: 'GPT-5', current: true });

    expect(selected.querySelector('.fb-model-selector__check')).toBeTruthy();
    expect(document.querySelectorAll('.fb-model-selector__option')).toHaveLength(4);
    expect(screen.queryByText('No models found')).toBeNull();
    expect(onModelChange).not.toHaveBeenCalled();
  });

  it('keeps the matching current model checked without stealing search focus', async () => {
    const user = userEvent.setup();

    render(<Harness />);

    await user.click(trigger());
    await openList(user, 'GPT-5');
    await user.type(screen.getByRole('textbox', { name: 'Search models' }), 'gpt-5');

    expect(
      screen
        .getByRole('button', { name: 'GPT-5', current: true })
        .querySelector('.fb-model-selector__check'),
    ).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Search models' }));
  });

  it('resets the query when reopening the list after Back', async () => {
    const user = userEvent.setup();

    render(<Harness />);

    await user.click(trigger());
    await openList(user, 'GPT-5');
    await user.type(screen.getByRole('textbox', { name: 'Search models' }), 'opus');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await openList(user, 'GPT-5');

    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Search models' }).value).toBe('');
    expect(document.querySelectorAll('.fb-model-selector__option')).toHaveLength(4);
  });

  it('resets the query after selecting a result and reopening with that result checked', async () => {
    const user = userEvent.setup();

    render(<Harness />);

    await user.click(trigger());
    await openList(user, 'GPT-5');
    await user.type(screen.getByRole('textbox', { name: 'Search models' }), 'opus');
    await user.click(screen.getByRole('button', { name: 'Claude Opus' }));
    await openList(user, 'Claude Opus');

    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Search models' }).value).toBe('');
    expect(
      screen
        .getByRole('button', { name: 'Claude Opus', current: true })
        .querySelector('.fb-model-selector__check'),
    ).toBeTruthy();
    expect(document.querySelectorAll('.fb-model-selector__option')).toHaveLength(4);
  });

  it('filters a 340-model list', async () => {
    const user = userEvent.setup();
    const choices = Array.from({ length: 340 }, (_, index) => ({
      id: `openrouter/vendor/model-${index}`,
      name: `Model ${index}`,
      provider: 'openrouter',
    }));

    render(<Harness choices={choices} initialModel={choices[0].id} />);

    await user.click(trigger());
    await user.type(screen.getByRole('textbox', { name: 'Search models' }), 'model-339');

    expect(screen.getByRole('button', { name: 'Model 339' }).getAttribute('title')).toBe(
      choices[339].id,
    );
    expect(document.querySelectorAll('.fb-model-selector__option')).toHaveLength(1);
  });

  it.each([' -- ', '(', '[', '*'])(
    'keeps all models for punctuation-only query %s',
    async (query) => {
      const user = userEvent.setup();

      render(<Harness />);

      await user.click(trigger());
      await openList(user, 'GPT-5');

      await user.type(
        screen.getByRole('textbox', { name: 'Search models' }),
        query.replaceAll('[', '[['),
      );

      expect(document.querySelectorAll('.fb-model-selector__option')).toHaveLength(4);
    },
  );

  it('renders a bundled provider logo before every row name and keeps headings text-only', async () => {
    const user = userEvent.setup();
    const bedrock = {
      id: 'bedrock/amazon.nova-micro-v1:0',
      name: 'Nova Micro',
      provider: 'bedrock',
    };

    render(<Harness choices={[gpt, bedrock]} />);

    await user.click(trigger());
    await openList(user, 'GPT-5');

    const row = screen.getByRole('button', { name: 'Nova Micro' });
    const logo = row.querySelector('.fb-model-selector__logo');

    expect(logo?.tagName.toLowerCase()).toBe('svg');
    expect(logo?.getAttribute('viewBox')).toBe(providerLogos.bedrock.viewBox);
    expect(logo?.getAttribute('stroke')).toBe('none');
    expect(logo?.getAttribute('aria-hidden')).toBe('true');
    expect(row.firstElementChild).toBe(logo);
    expect(row.querySelectorAll('svg')).toHaveLength(1);
    expect(document.querySelectorAll('.fb-model-selector__logo')).toHaveLength(2);
    expect(document.querySelector('.fb-model-selector__group-label svg')).toBeNull();
  });

  it.each([undefined, 'browser', 'toString'])(
    'uses the fallback logo for provider %s',
    async (provider) => {
      const user = userEvent.setup();

      render(<Harness choices={[gpt, { id: 'custom/model', name: 'Custom Model', provider }]} />);

      await user.click(trigger());
      await openList(user, 'GPT-5');

      const logo = screen.getByRole('button', { name: 'Custom Model' }).querySelector('svg');

      expect(logo?.getAttribute('viewBox')).toBe('0 0 20 20');
      expect(logo?.querySelector('path')?.getAttribute('d')).toBe(sparkleIcon[0][1].d);
      expect(logo?.getAttribute('aria-hidden')).toBe('true');
    },
  );

  it('shows secondary IDs only for duplicate names and gives every row its full ID title', async () => {
    const user = userEvent.setup();
    const duplicates = [
      { id: 'bedrock/gpt-oss-120b', name: 'GPT OSS 120B', provider: 'bedrock' },
      { id: 'bedrock/gpt-oss-120b-1:0', name: 'GPT OSS 120B', provider: 'bedrock' },
    ];

    render(<Harness choices={[gpt, ...duplicates]} />);

    await user.click(trigger());
    await openList(user, 'GPT-5');

    expect(
      screen.getByRole('button', { name: 'GPT-5' }).querySelector('.fb-model-selector__option-id'),
    ).toBeNull();

    duplicates.forEach(({ id, name }) => {
      const row = screen.getByRole('button', { name: `${name} ${id}` });

      expect(row.querySelector('.fb-model-selector__option-id')?.textContent).toBe(id);
      expect(row.getAttribute('title')).toBe(id);
    });

    expect(screen.getByRole('button', { name: 'GPT-5' }).getAttribute('title')).toBe(gpt.id);
  });

  it('shows the display name rather than the ID in the trigger and model heading', async () => {
    const user = userEvent.setup();
    const nova = {
      id: 'bedrock/us.amazon.nova-micro-v1:0',
      name: 'Nova Micro (US)',
      provider: 'bedrock',
      reasoning: [{ key: 'standard', label: 'Standard' }],
    };

    render(<Harness choices={[nova]} initialModel={nova.id} />);

    expect(trigger().textContent).toBe(`${nova.name} · Default`);

    await user.click(trigger());

    expect(screen.getByRole('button', { name: `${nova.name}, change model` }).textContent).toBe(
      nova.name,
    );
  });

  it('moves typing from a focused row into the search field', async () => {
    const user = userEvent.setup();

    render(<Harness />);

    await user.click(trigger());
    await openList(user, 'GPT-5');
    await user.keyboard('opus');

    expect(document.activeElement).toBe(searchBox());
    expect(searchBox().value).toBe('opus');
    expect(rowNames()).toEqual(['Claude Opus']);
  });

  it('moves typing from the Back button into the search field', async () => {
    const user = userEvent.setup();

    render(<Harness />);

    await user.click(trigger());
    await openList(user, 'GPT-5');

    screen.getByRole('button', { name: 'Back' }).focus();

    await user.keyboard('4o');

    expect(searchBox().value).toBe('4o');
    expect(rowNames()).toEqual(['GPT-4o']);
  });

  it('moves Backspace from a row into the search field and deletes', async () => {
    const user = userEvent.setup();

    render(<Harness />);

    await user.click(trigger());
    await openList(user, 'GPT-5');
    await user.type(searchBox(), 'gpt');
    await user.keyboard('{ArrowDown}{Backspace}');

    expect(document.activeElement).toBe(searchBox());
    expect(searchBox().value).toBe('gp');
  });

  it('chooses the focused row with Space instead of typing it', async () => {
    const onModelChange = vi.fn();
    const user = userEvent.setup();

    render(<Harness onModelChange={onModelChange} />);

    await user.click(trigger());
    await openList(user, 'GPT-5');
    await user.keyboard('{ArrowDown} ');

    expect(onModelChange).toHaveBeenCalledWith(mini.id);
    expect(screen.queryByRole('textbox', { name: 'Search models' })).toBeNull();
    expect(screen.getByRole('button', { name: 'GPT-5 mini, change model' })).toBeTruthy();
  });

  it.each(['{Control>}a{/Control}', '{Meta>}k{/Meta}', '{Alt>}o{/Alt}'])(
    'does not redirect the modified key %s from a row',
    async (keys) => {
      const user = userEvent.setup();

      render(<Harness />);

      await user.click(trigger());
      await openList(user, 'GPT-5');
      await user.keyboard(keys);

      expect(document.activeElement).toBe(row('GPT-5'));
      expect(searchBox().value).toBe('');
    },
  );

  it.each([
    ['isComposing', { key: 'a', isComposing: true }],
    ['Process', { key: 'Process' }],
  ])('does not redirect %s keys during IME composition', async (_, init) => {
    const user = userEvent.setup();

    render(<Harness />);

    await user.click(trigger());
    await openList(user, 'GPT-5');

    fireEvent.keyDown(row('GPT-5'), init);

    expect(document.activeElement).toBe(row('GPT-5'));
    expect(searchBox().value).toBe('');
  });

  it('moves focus between the field and results with the arrow keys', async () => {
    const user = userEvent.setup();

    render(<Harness />);

    await user.click(trigger());
    await openList(user, 'GPT-5');
    await user.click(searchBox());
    await user.keyboard('{ArrowDown}');

    expect(document.activeElement).toBe(row('GPT-5'));

    await user.keyboard('{ArrowDown}{ArrowDown}');

    expect(document.activeElement).toBe(row('GPT-4o'));

    await user.keyboard('{ArrowDown}');

    expect(document.activeElement).toBe(row('Claude Opus'));

    await user.keyboard('{ArrowDown}');

    expect(document.activeElement).toBe(row('Claude Opus'));

    await user.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}');

    expect(document.activeElement).toBe(searchBox());
  });

  it('moves Down from the field to the first filtered result', async () => {
    const user = userEvent.setup();

    render(<Harness />);

    await user.click(trigger());
    await openList(user, 'GPT-5');
    await user.type(searchBox(), 'mini{ArrowDown}');

    expect(document.activeElement).toBe(row('GPT-5 mini'));
  });

  it('chooses the first result with Enter in the field', async () => {
    const onModelChange = vi.fn();
    const user = userEvent.setup();

    render(<Harness onModelChange={onModelChange} />);

    await user.click(trigger());
    await openList(user, 'GPT-5');
    await user.keyboard('opus{Enter}');

    expect(onModelChange).toHaveBeenCalledWith(opus.id);
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Claude Opus, change model' }),
    );
  });

  it('chooses the focused result with Enter', async () => {
    const onModelChange = vi.fn();
    const user = userEvent.setup();

    render(<Harness onModelChange={onModelChange} />);

    await user.click(trigger());
    await openList(user, 'GPT-5');
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');

    expect(onModelChange).toHaveBeenCalledWith(plain.id);
  });

  it('does nothing on Enter in the field without results', async () => {
    const onModelChange = vi.fn();
    const user = userEvent.setup();

    render(<Harness onModelChange={onModelChange} />);

    await user.click(trigger());
    await openList(user, 'GPT-5');
    await user.keyboard('zzz{Enter}');

    expect(onModelChange).not.toHaveBeenCalled();
    expect(searchBox().value).toBe('zzz');
  });

  it('does not choose a model on Enter while composing', async () => {
    const onModelChange = vi.fn();
    const user = userEvent.setup();

    render(<Harness onModelChange={onModelChange} />);

    await user.click(trigger());
    await openList(user, 'GPT-5');
    await user.type(searchBox(), 'opus');

    fireEvent.keyDown(searchBox(), { key: 'Enter', isComposing: true });

    expect(onModelChange).not.toHaveBeenCalled();
    expect(searchBox().value).toBe('opus');
  });

  it('clears the query with Escape before closing the popover', async () => {
    const onModelChange = vi.fn();
    const user = userEvent.setup();

    render(<Harness onModelChange={onModelChange} />);

    await user.click(trigger());
    await openList(user, 'GPT-5');
    await user.keyboard('opus{Escape}');

    expect(searchBox().value).toBe('');
    expect(document.querySelectorAll('.fb-model-selector__option')).toHaveLength(4);
    expect(openTrigger()).toBeTruthy();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('textbox', { name: 'Search models' })).toBeNull();
    expect(document.activeElement).toBe(trigger());
    expect(onModelChange).not.toHaveBeenCalled();
  });

  it('clears the query with Escape while a row has focus', async () => {
    const user = userEvent.setup();

    render(<Harness />);

    await user.click(trigger());
    await openList(user, 'GPT-5');
    await user.type(searchBox(), 'opus{ArrowDown}');

    expect(document.activeElement).toBe(row('Claude Opus'));

    await user.keyboard('{Escape}');

    expect(searchBox().value).toBe('');
    expect(openTrigger()).toBeTruthy();
    expect(row('GPT-5').getAttribute('aria-current')).toBe('true');
  });

  it('keeps the hidden selected model checked and unchanged after Escape clears its query', async () => {
    const onModelChange = vi.fn();
    const user = userEvent.setup();

    render(<Harness onModelChange={onModelChange} />);

    await user.click(trigger());
    await openList(user, 'GPT-5');
    await user.keyboard('opus');

    expect(screen.queryByRole('button', { name: 'GPT-5' })).toBeNull();

    await user.keyboard('{Escape}');

    const selected = row('GPT-5');

    expect(selected.getAttribute('aria-current')).toBe('true');
    expect(selected.querySelector('.fb-model-selector__check')).toBeTruthy();
    expect(document.querySelectorAll('.fb-model-selector__check')).toHaveLength(1);
    expect(onModelChange).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');

    expect(trigger().textContent).toBe('GPT-5 · Default');
  });

  it('closes on Escape after Back even if a query was typed', async () => {
    const user = userEvent.setup();

    render(<Harness />);

    await user.click(trigger());
    await openList(user, 'GPT-5');
    await user.type(searchBox(), 'opus');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.keyboard('{Escape}');

    expect(document.activeElement).toBe(trigger());
  });

  it('announces the result count in a polite status line', async () => {
    const user = userEvent.setup();

    render(<Harness />);

    await user.click(trigger());
    await openList(user, 'GPT-5');

    const status = screen.getByRole('status');

    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toBe('4 models');

    await user.type(searchBox(), 'opus');

    expect(status.textContent).toBe('1 model');

    await user.type(searchBox(), 'zzz');

    expect(status.textContent).toBe('No models found');
  });

  it('renders nothing without models', () => {
    const { container, rerender } = render(
      <ModelSelector
        selectedModelId={gpt.id}
        onModelChange={() => undefined}
        onReasoningChange={() => undefined}
      />,
    );

    expect(container.innerHTML).toBe('');

    rerender(
      <ModelSelector
        models={[]}
        selectedModelId={gpt.id}
        onModelChange={() => undefined}
        onReasoningChange={() => undefined}
      />,
    );

    expect(container.innerHTML).toBe('');
  });

  it('shows the model name and the selected level on the trigger', () => {
    render(<Harness initialReasoning="medium" />);

    expect(trigger().textContent).toBe('GPT-5 · Medium');
  });

  it('shows Default on the trigger when no level is selected', () => {
    render(<Harness />);

    expect(trigger().textContent).toBe('GPT-5 · Default');
  });

  it('shows only the name on the trigger for a model without reasoning levels', () => {
    render(<Harness initialModel={plain.id} />);

    expect(trigger().textContent).toBe('GPT-4o');
  });

  it('shows Default on the trigger for a level the model does not offer', () => {
    render(<Harness initialModel={opus.id} initialReasoning="minimal" />);

    expect(trigger().textContent).toBe('Claude Opus · Default');
  });

  it('styles the model name separately from the muted level', () => {
    render(<Harness initialReasoning="low" />);

    const [name, level] = trigger().querySelectorAll('span');

    expect(name.className).toBe('fb-model-selector__name');
    expect(name.textContent).toBe('GPT-5');
    expect(level.className).toBe('fb-model-selector__level');
    expect(level.textContent).toBe('· Low');
  });

  it('renders the trigger as a borderless text button', () => {
    render(<Harness />);

    expect(trigger().className).toBe('fb-model-selector__trigger');
    expect(trigger().getAttribute('type')).toBe('button');
  });

  it('opens on the reasoning controls instead of the model list', async () => {
    const user = userEvent.setup();

    render(<Harness />);

    await user.click(trigger());

    expect(screen.getByRole('slider', { name: 'Reasoning' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'GPT-5, change model' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Claude Opus' })).toBeNull();
  });

  it('the controls show the active level as the only text above the slider', async () => {
    const user = userEvent.setup();

    render(<Harness initialReasoning="low" />);

    await user.click(trigger());

    const card = document.querySelector('.fb-model-selector__reasoning') as HTMLElement;

    expect(card.textContent).toBe('Low');
    expect(screen.queryByText('Reasoning')).toBeNull();
    expect(screen.getByRole('slider', { name: 'Reasoning' }).getAttribute('aria-valuetext')).toBe(
      'Low',
    );
  });

  it('focuses the model name button when the popover opens', async () => {
    const user = userEvent.setup();

    render(<Harness />);

    await user.click(trigger());

    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'GPT-5, change model' }),
    );
  });

  it('opens straight on the list for a model without reasoning levels', async () => {
    const user = userEvent.setup();

    render(<Harness initialModel={plain.id} />);

    await user.click(trigger());

    expect(openTrigger().textContent).toBe('Select model');
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'GPT-4o, change model' })).toBeNull();
    expect(screen.queryByRole('slider')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'GPT-4o' }));
  });

  it('offers Default followed by the model levels as slider stops', async () => {
    const user = userEvent.setup();

    render(<Harness />);

    await user.click(trigger());

    expect(stopLabels()).toEqual(['Default', 'Minimal', 'Low', 'Medium', 'High']);
  });

  it('offers Default and the only level for a single-level model', async () => {
    const user = userEvent.setup();

    render(<Harness initialModel={mini.id} />);

    await user.click(trigger());

    expect(stopLabels()).toEqual(['Default', 'High']);
    expect(screen.getByRole('slider').getAttribute('max')).toBe('1');
  });

  it('offers labelled budget levels as slider stops', async () => {
    const user = userEvent.setup();

    render(<Harness initialModel={opus.id} />);

    await user.click(trigger());

    expect(stopLabels()).toEqual(['Default', 'High · 16k', 'Max · 32k']);
  });

  it('positions the slider on the selected level', async () => {
    const user = userEvent.setup();

    render(<Harness initialModel={opus.id} initialReasoning="max" />);

    await user.click(trigger());

    const slider = screen.getByRole<HTMLInputElement>('slider');

    expect(slider.value).toBe('2');
    expect(slider.getAttribute('aria-valuetext')).toBe('Max · 32k');
  });

  it('reports the level key when the slider moves to a level', async () => {
    const onReasoningChange = vi.fn();
    const user = userEvent.setup();

    render(<Harness initialModel={opus.id} onReasoningChange={onReasoningChange} />);

    await user.click(trigger());

    fireEvent.change(screen.getByRole('slider'), { target: { value: '1' } });

    expect(onReasoningChange).toHaveBeenLastCalledWith('high');
    expect(openTrigger().textContent).toBe('Select effort');

    await user.keyboard('{Escape}');

    expect(trigger().textContent).toBe('Claude Opus · High · 16k');
  });

  it('reports undefined when the slider moves to Default', async () => {
    const onReasoningChange = vi.fn();
    const user = userEvent.setup();

    render(<Harness initialReasoning="high" onReasoningChange={onReasoningChange} />);

    await user.click(trigger());

    fireEvent.change(screen.getByRole('slider'), { target: { value: '0' } });

    expect(onReasoningChange).toHaveBeenLastCalledWith(undefined);
    expect(openTrigger().textContent).toBe('Select effort');

    await user.keyboard('{Escape}');

    expect(trigger().textContent).toBe('GPT-5 · Default');
  });

  it('switches the popover to the model list from the model name', async () => {
    const user = userEvent.setup();

    render(<Harness />);

    await user.click(trigger());
    await openList(user, 'GPT-5');

    expect(screen.queryByRole('slider')).toBeNull();
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Claude Opus' })).toBeTruthy();
  });

  it('groups the model list by provider when several providers are allowed', async () => {
    const user = userEvent.setup();

    render(<Harness />);

    await user.click(trigger());
    await openList(user, 'GPT-5');

    const openai = screen.getByRole('group', { name: 'OpenAI' });
    const anthropic = screen.getByRole('group', { name: 'Anthropic' });

    expect(openai.querySelectorAll('.fb-model-selector__option')).toHaveLength(3);
    expect(anthropic.querySelectorAll('.fb-model-selector__option')).toHaveLength(1);
  });

  it('lists models without provider groups when one provider is allowed', async () => {
    const user = userEvent.setup();

    render(<Harness choices={[gpt, mini, plain]} />);

    await user.click(trigger());
    await openList(user, 'GPT-5');

    expect(screen.queryByRole('group')).toBeNull();
    expect(document.querySelectorAll('.fb-model-selector__option')).toHaveLength(3);
  });

  it('marks and focuses the selected model in the list', async () => {
    const user = userEvent.setup();

    render(<Harness />);

    await user.click(trigger());
    await openList(user, 'GPT-5');

    const current = screen.getByRole('button', { name: 'GPT-5', current: true });

    expect(document.activeElement).toBe(current);
    expect(current.querySelector('.fb-model-selector__check')).toBeTruthy();
  });

  it('reports the chosen model and returns to the controls', async () => {
    const onModelChange = vi.fn();
    const user = userEvent.setup();

    render(<Harness onModelChange={onModelChange} />);

    await user.click(trigger());
    await openList(user, 'GPT-5');
    await user.click(screen.getByRole('button', { name: 'Claude Opus' }));

    expect(onModelChange).toHaveBeenCalledWith(opus.id);
    expect(stopLabels()).toEqual(['Default', 'High · 16k', 'Max · 32k']);
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Claude Opus, change model' }),
    );
  });

  it('does not report a change when the current model is chosen again', async () => {
    const onModelChange = vi.fn();
    const user = userEvent.setup();

    render(<Harness onModelChange={onModelChange} />);

    await user.click(trigger());
    await openList(user, 'GPT-5');
    await user.click(screen.getByRole('button', { name: 'GPT-5', current: true }));

    expect(onModelChange).not.toHaveBeenCalled();
    expect(screen.getByRole('slider')).toBeTruthy();
  });

  it('returns from the list without changing the model or level', async () => {
    const onModelChange = vi.fn();
    const onReasoningChange = vi.fn();
    const user = userEvent.setup();

    render(
      <Harness
        initialReasoning="low"
        onModelChange={onModelChange}
        onReasoningChange={onReasoningChange}
      />,
    );

    await user.click(trigger());
    await openList(user, 'GPT-5');
    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(onModelChange).not.toHaveBeenCalled();
    expect(onReasoningChange).not.toHaveBeenCalled();
    expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toBe('Low');
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'GPT-5, change model' }),
    );
  });

  it('reopens on the controls after closing from the list', async () => {
    const user = userEvent.setup();

    render(<Harness />);

    await user.click(trigger());
    await openList(user, 'GPT-5');
    await user.keyboard('{Escape}');
    await user.click(trigger());

    expect(screen.getByRole('slider')).toBeTruthy();
  });

  it('returns focus to the trigger when the popover closes', async () => {
    const user = userEvent.setup();

    render(<Harness />);

    await user.click(trigger());
    await user.keyboard('{Escape}');

    expect(document.activeElement).toBe(trigger());
  });

  it('switches the trigger label between model and level, Select effort and Select model', async () => {
    const user = userEvent.setup();

    render(<Harness />);

    expect(trigger().textContent).toBe('GPT-5 · Default');

    await user.click(trigger());

    expect(openTrigger().textContent).toBe('Select effort');

    await openList(user, 'GPT-5');

    expect(openTrigger().textContent).toBe('Select model');

    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(openTrigger().textContent).toBe('Select effort');

    await openList(user, 'GPT-5');
    await user.click(screen.getByRole('button', { name: 'Claude Opus' }));

    expect(openTrigger().textContent).toBe('Select effort');
  });

  it('returns to the model and level after Escape, an outside click and a trigger click', async () => {
    const user = userEvent.setup();

    render(<Harness />);

    await user.click(trigger());
    await user.keyboard('{Escape}');

    expect(trigger().textContent).toBe('GPT-5 · Default');

    await user.click(trigger());
    await user.click(document.body);

    expect(trigger().textContent).toBe('GPT-5 · Default');

    await user.click(trigger());
    await user.click(openTrigger());

    expect(trigger().textContent).toBe('GPT-5 · Default');
  });

  it('keeps the Select effort label while the slider changes level', async () => {
    const user = userEvent.setup();

    render(<Harness initialReasoning="low" />);

    await user.click(trigger());

    fireEvent.change(screen.getByRole('slider', { name: 'Reasoning' }), { target: { value: '3' } });

    expect(openTrigger().textContent).toBe('Select effort');

    fireEvent.change(screen.getByRole('slider', { name: 'Reasoning' }), { target: { value: '0' } });

    expect(openTrigger().textContent).toBe('Select effort');
  });

  it('exposes the visible label as the button name with expanded and haspopup', async () => {
    const user = userEvent.setup();

    render(<Harness />);

    const closed = screen.getByRole('button', { name: 'GPT-5 · Default', expanded: false });

    expect(closed.getAttribute('aria-haspopup')).toBe('dialog');

    await user.click(trigger());

    const open = screen.getByRole('button', { name: 'Select effort', expanded: true });

    expect(open.getAttribute('aria-haspopup')).toBe('dialog');
  });

  it('shows the effort view after choosing a model with levels from the list-first view', async () => {
    const user = userEvent.setup();

    render(<Harness initialModel={plain.id} />);

    await user.click(trigger());
    await user.click(screen.getByRole('button', { name: 'GPT-5 mini' }));

    expect(openTrigger().textContent).toBe('Select effort');
    expect(screen.getByRole('slider', { name: 'Reasoning' })).toBeTruthy();
  });

  it('closes without a change when the current model is chosen from the list-first view', async () => {
    const onModelChange = vi.fn();
    const user = userEvent.setup();

    render(<Harness initialModel={plain.id} onModelChange={onModelChange} />);

    await user.click(trigger());
    await user.click(screen.getByRole('button', { name: 'GPT-4o' }));

    expect(onModelChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: 'Search models' })).toBeNull();
    expect(document.activeElement).toBe(trigger());
    expect(trigger().textContent).toBe('GPT-4o');
  });

  it('chooses a no-effort model with Enter in the search field and closes', async () => {
    const onModelChange = vi.fn();
    const user = userEvent.setup();

    render(<Harness onModelChange={onModelChange} />);

    await user.click(trigger());
    await openList(user, 'GPT-5');
    await user.click(searchBox());
    await user.keyboard('gpt-4o{Enter}');

    expect(onModelChange).toHaveBeenCalledWith(plain.id);
    expect(screen.queryByRole('textbox', { name: 'Search models' })).toBeNull();
    expect(document.activeElement).toBe(trigger());
    expect(trigger().textContent).toBe('GPT-4o');
  });

  it('chooses a no-effort row with Space, closes and focuses the trigger', async () => {
    const onModelChange = vi.fn();
    const user = userEvent.setup();

    render(<Harness initialModel={mini.id} onModelChange={onModelChange} />);

    await user.click(trigger());
    await openList(user, 'GPT-5 mini');
    await user.keyboard('{ArrowDown} ');

    expect(onModelChange).toHaveBeenCalledWith(plain.id);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger());
    expect(trigger().textContent).toBe('GPT-4o');
  });

  it('reopens on the full list with an empty query after a no-effort choice closed it', async () => {
    const user = userEvent.setup();

    render(<Harness />);

    await user.click(trigger());
    await openList(user, 'GPT-5');
    await user.type(searchBox(), 'gpt-4o{Enter}');
    await user.click(trigger());

    expect(openTrigger().textContent).toBe('Select model');
    expect(searchBox().value).toBe('');
    expect(rowNames()).toEqual(['GPT-5', 'GPT-5 mini', 'GPT-4o', 'Claude Opus']);
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'GPT-4o', current: true }),
    );
  });

  it('reopens on the effort view after a model with levels was chosen and the popover closed', async () => {
    const user = userEvent.setup();

    render(<Harness initialModel={plain.id} />);

    await user.click(trigger());
    await user.type(searchBox(), 'opus{Enter}');
    await user.keyboard('{Escape}');

    expect(trigger().textContent).toBe('Claude Opus · Default');

    await user.click(trigger());

    expect(openTrigger().textContent).toBe('Select effort');
    expect(screen.getByRole('slider', { name: 'Reasoning' })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Search models' })).toBeNull();
  });

  it('lands on the list with the search box focused when the active model is not in the list', async () => {
    const user = userEvent.setup();

    render(<Harness initialModel="openai/retired" />);

    expect(trigger().textContent).toBe('openai/retired');

    await user.click(trigger());

    expect(openTrigger().textContent).toBe('Select model');
    expect(document.activeElement).toBe(searchBox());
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    expect(document.querySelectorAll('.fb-model-selector__option[aria-current]')).toHaveLength(0);
  });

  it('clears the query on the first Escape and closes on the second', async () => {
    const user = userEvent.setup();

    render(<Harness initialModel={plain.id} />);

    await user.click(trigger());
    await user.type(searchBox(), 'opus');

    expect(rowNames()).toEqual(['Claude Opus']);

    await user.keyboard('{Escape}');

    expect(searchBox().value).toBe('');
    expect(screen.getByRole('dialog')).toBeTruthy();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('pins the popover width and search box tokens in CSS', () => {
    const selector = readFileSync('packages/ui/src/chat/model-selector.css', 'utf8');
    const content = selector.match(/\.fb-model-selector__content\s*{([^}]*)}/)?.[1] ?? '';
    const search = selector.match(/\.fb-model-selector__search\s*{([^}]*)}/)?.[1] ?? '';

    const shared = readFileSync('packages/ui/src/components/search-input.css', 'utf8');
    const input = shared.match(/\.fb-search-input\s*{([^}]*)}/)?.[1] ?? '';

    expect(content).toContain('width: min(22rem, calc(100vw - 2rem))');
    expect(content).not.toContain('max-content');
    expect(content).not.toContain('min-width');
    expect(content).not.toContain('max-width');
    expect(search).toContain('background-color: var(--theme-base-200)');
    expect(search).toContain('border: 1px solid var(--theme-base-300)');
    expect(input).toContain('background: var(--theme-base-150)');
    expect(input).not.toContain('border:');
  });
});
